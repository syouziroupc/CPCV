import { AuthError } from "../auth/errors.js";
import { appendRealtimeEvent } from "../realtime/repository.js";
import { dispatchRealtimeEvent } from "../realtime/dispatch.js";
import { translationCommentPayload } from "./repository.js";
import { evaluateTranslationFilter } from "../content-filter/repository.js";
import { inspectCommentPrivacy } from "./privacy.js";
import { runModerationModel, runTranslationModel } from "./provider.js";
import {
  claimAiJob,
  completeModerationJob,
  completePrivacyGuardModeration,
  completeTranslationJob,
  createAiJobsForComment,
  failOrRetryAiJob,
  getCompletedTranslationDelivery,
  listDueAiJobs,
  reserveAiUsage,
  skipAiJob
} from "./repository.js";

const QUEUE_KIND_TRANSLATION = "translation";
const QUEUE_KIND_MODERATION = "moderation";
const QUEUE_KIND_LEGACY = "legacy";

export async function scheduleAiForComment(env, input, options = {}) {
  if (!env?.DB_V2) return { jobs: [], dispatched: 0 };
  const jobs = await createAiJobsForComment(env.DB_V2, input);
  const dispatched = options.dispatch === false ? 0 : await dispatchAiJobs(env, jobs);
  return { jobs, dispatched };
}

export async function dispatchAiJobs(env, jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return 0;

  const groups = {
    [QUEUE_KIND_TRANSLATION]: [],
    [QUEUE_KIND_MODERATION]: [],
    [QUEUE_KIND_LEGACY]: []
  };
  for (const job of jobs) {
    const jobId = normalizeJobId(job?.id);
    if (!jobId) continue;
    const message = { body: { jobId } };
    if (job?.jobType === QUEUE_KIND_TRANSLATION) groups[QUEUE_KIND_TRANSLATION].push(message);
    else if (job?.jobType === QUEUE_KIND_MODERATION) groups[QUEUE_KIND_MODERATION].push(message);
    else groups[QUEUE_KIND_LEGACY].push(message);
  }

  const legacyQueue = env?.AI_JOBS_QUEUE;
  const dispatched = await Promise.all([
    dispatchQueueGroup(
      env?.AI_TRANSLATION_QUEUE,
      legacyQueue,
      groups[QUEUE_KIND_TRANSLATION],
      QUEUE_KIND_TRANSLATION
    ),
    dispatchQueueGroup(
      env?.AI_MODERATION_QUEUE,
      legacyQueue,
      groups[QUEUE_KIND_MODERATION],
      QUEUE_KIND_MODERATION
    ),
    dispatchQueueGroup(
      legacyQueue,
      null,
      groups[QUEUE_KIND_LEGACY],
      QUEUE_KIND_LEGACY
    )
  ]);
  return dispatched.reduce((total, count) => total + count, 0);
}

async function dispatchQueueGroup(primaryQueue, fallbackQueue, messages, label) {
  if (!messages.length) return 0;
  const primary = await sendQueueMessages(primaryQueue, messages, label);
  if (!primary.unsent.length || !fallbackQueue || fallbackQueue === primaryQueue) return primary.sent;
  const fallback = await sendQueueMessages(fallbackQueue, primary.unsent, `${label}-fallback`);
  return primary.sent + fallback.sent;
}

async function sendQueueMessages(queue, messages, label) {
  if (!queue || (typeof queue.send !== "function" && typeof queue.sendBatch !== "function")) {
    return { sent: 0, unsent: messages };
  }

  if (typeof queue.sendBatch === "function") {
    try {
      await queue.sendBatch(messages);
      return { sent: messages.length, unsent: [] };
    } catch (error) {
      console.error(`AI ${label} queue batch dispatch failed`, safeCode(error));
    }
  }

  if (typeof queue.send !== "function") return { sent: 0, unsent: messages };
  const results = await Promise.allSettled(messages.map((message) => queue.send(message.body)));
  const unsent = [];
  let sent = 0;
  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result.status === "fulfilled") sent += 1;
    else {
      unsent.push(messages[index]);
      console.error(`AI ${label} queue dispatch failed`, safeCode(result.reason));
    }
  }
  return { sent, unsent };
}

export async function processAiQueueBatch(batch, env) {
  const messages = Array.from(batch?.messages || []);
  if (!messages.length) return;
  const queueKind = queueKindFromName(batch?.queue);
  const parallelism = queueParallelism(env, queueKind, messages.length);
  await runWithConcurrency(messages, parallelism, (message) => processAiQueueMessage(message, env, queueKind));
}

async function processAiQueueMessage(message, env, queueKind) {
  try {
    const jobId = normalizeJobId(message?.body?.jobId ?? message?.body);
    if (!jobId) {
      message?.ack?.();
      return;
    }
    if (!await acquireQueueCapacity(env, queueKind)) {
      message?.retry?.({ delaySeconds: capacityRetryDelaySeconds(queueKind) });
      return;
    }
    const outcome = await processAiJob(env, jobId);
    if (outcome.retry) message?.retry?.({ delaySeconds: outcome.delaySeconds });
    else message?.ack?.();
  } catch (error) {
    console.error("AI queue message failed", safeCode(error));
    message?.retry?.({ delaySeconds: 30 });
  }
}

async function acquireQueueCapacity(env, queueKind) {
  if (queueKind !== QUEUE_KIND_TRANSLATION) return true;
  const limiter = env?.AI_TRANSLATION_RATE_LIMITER;
  if (!limiter || typeof limiter.limit !== "function") return true;
  try {
    const result = await limiter.limit({ key: `workers-ai-${queueKind}` });
    return result?.success !== false;
  } catch (error) {
    console.error(`AI ${queueKind} capacity limiter failed closed`, safeCode(error));
    return false;
  }
}

function capacityRetryDelaySeconds(queueKind) {
  return queueKind === QUEUE_KIND_TRANSLATION ? 10 : 20;
}

async function runWithConcurrency(items, parallelism, worker) {
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(parallelism, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      await worker(items[index]);
    }
  });
  await Promise.all(runners);
}

function queueParallelism(env, queueKind, batchSize) {
  if (queueKind === QUEUE_KIND_TRANSLATION) {
    return normalizeParallelism(env?.AI_TRANSLATION_QUEUE_PARALLELISM, batchSize, 6);
  }
  if (queueKind === QUEUE_KIND_MODERATION) {
    return normalizeParallelism(env?.AI_MODERATION_QUEUE_PARALLELISM, batchSize, 5);
  }
  return normalizeParallelism(env?.AI_QUEUE_PARALLELISM, batchSize, 5);
}

function normalizeParallelism(value, batchSize, fallbackLimit = 5) {
  const parsed = Number(value);
  const fallback = Math.min(fallbackLimit, Math.max(1, Number(batchSize) || 1));
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100
    ? Math.min(parsed, Math.max(1, batchSize))
    : fallback;
}

function queueKindFromName(value) {
  const name = String(value || "").toLowerCase();
  if (name.includes("translation")) return QUEUE_KIND_TRANSLATION;
  if (name.includes("moderation")) return QUEUE_KIND_MODERATION;
  return QUEUE_KIND_LEGACY;
}

export async function processAiJob(env, jobId, options = {}) {
  if (!env?.DB_V2) throw new Error("DB_V2_NOT_CONFIGURED");
  const now = options.now ?? Date.now();
  const job = await claimAiJob(env.DB_V2, jobId, now);
  if (!job) {
    const delivery = await getCompletedTranslationDelivery(env.DB_V2, jobId);
    if (!delivery) return { retry: false, ignored: true };
    const delivered = await dispatchTranslationRealtime(env, delivery.liveSessionId, delivery);
    return delivered
      ? { retry: false, ignored: true, redelivered: true, sequence: delivery.sequence }
      : { retry: true, delaySeconds: 3, deliveryOnly: true, sequence: delivery.sequence };
  }
  if (Date.parse(job.retained_until || "") <= Number(now)) {
    await skipAiJob(env.DB_V2, job, "COMMENT_EXPIRED", now);
    return { retry: false, skipped: "COMMENT_EXPIRED" };
  }

  if (!job.organization_ai_enabled || job.organization_status !== "active") {
    await skipAiJob(env.DB_V2, job, "AI_DISABLED", now);
    if (job.job_type === "translation") await dispatchTranslationUnavailable(env, job, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.moderation_state === "deleted") {
    await skipAiJob(env.DB_V2, job, "COMMENT_DELETED", now);
    return { retry: false, skipped: "COMMENT_DELETED" };
  }
  const unsupportedAiReview = Boolean(job.session_filter_enabled)
    && Boolean(job.unsupported_language)
    && job.unsupported_language_mode === "ai_review";
  if (job.job_type === "moderation" && !job.session_moderation_enabled && !unsupportedAiReview) {
    await skipAiJob(env.DB_V2, job, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.job_type === "translation" && !job.session_translation_enabled) {
    await skipAiJob(env.DB_V2, job, "AI_DISABLED", now);
    await dispatchTranslationUnavailable(env, job, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.job_type === "translation" && job.moderation_state !== "visible") {
    await skipAiJob(env.DB_V2, job, "COMMENT_NOT_VISIBLE", now);
    return { retry: false, skipped: "COMMENT_NOT_VISIBLE" };
  }
  if (job.job_type === "translation" && job.target_language !== job.session_target_language) {
    await skipAiJob(env.DB_V2, job, "AI_SETTING_CHANGED", now);
    await dispatchTranslationUnavailable(env, job, "AI_SETTING_CHANGED", now);
    return { retry: false, skipped: "AI_SETTING_CHANGED" };
  }

  const privacy = inspectCommentPrivacy(job.message);
  if (privacy.sensitive) {
    if (job.job_type === "moderation") {
      await completePrivacyGuardModeration(env.DB_V2, { job, promptInjection: privacy.promptInjection, now });
      return { retry: false, completed: true, source: "local_privacy_guard" };
    }
    await skipAiJob(env.DB_V2, job, "PII_DETECTED", now);
    await dispatchTranslationUnavailable(env, job, "PII_DETECTED", now);
    return { retry: false, skipped: "PII_DETECTED" };
  }

  try {
    if (job.job_type === "moderation") {
      const result = await runModerationModel(env, {
        message: job.message,
        promptInjection: privacy.promptInjection,
        dictionaryCandidates: parseFilterContext(job.filter_context_json)
      }, {
        reserveUsage: (model) => reserveAiUsage(env.DB_V2, job, now, model)
      });
      const categories = privacy.promptInjection
        ? [...new Set([...result.categories, "prompt_injection"])]
        : result.categories;
      await completeModerationJob(env.DB_V2, {
        job,
        recommendation: result.recommendation,
        confidenceMilli: result.confidenceMilli,
        categories,
        source: "provider",
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        outputCharacters: result.rawOutputLength,
        usageEventId: result.usageEventId,
        now
      });
      return { retry: false, completed: true };
    }

    const result = await runTranslationModel(env, {
      message: job.message,
      sourceLanguage: job.detected_language,
      targetLanguage: job.target_language,
      quality: job.session_translation_quality || "balanced"
    }, {
      reserveUsage: (model) => reserveAiUsage(env.DB_V2, job, now, model)
    });
    const filterDecision = await evaluateTranslationFilter(env.DB_V2, {
      organizationId: job.organization_id,
      liveSessionId: job.live_session_id,
      translatedText: result.translatedText,
      targetLanguage: job.target_language
    });
    const event = await completeTranslationJob(env.DB_V2, {
      job,
      translatedText: result.translatedText,
      filterDecision,
      provider: result.provider,
      model: result.model,
      promptVersion: result.promptVersion,
      outputCharacters: result.rawOutputLength,
      usageEventId: result.usageEventId,
      now
    });
    if (!event) {
      const unavailable = await dispatchTranslationUnavailable(env, job, "TRANSLATION_FILTERED", now);
      return { retry: false, completed: true, sequence: unavailable?.sequence || null, realtimeDelivered: Boolean(unavailable) };
    }
    const realtimeDelivered = await dispatchTranslationRealtime(env, job.live_session_id, event);
    return realtimeDelivered
      ? { retry: false, completed: true, sequence: event.sequence, realtimeDelivered: true }
      : { retry: true, delaySeconds: 3, completed: true, deliveryOnly: true, sequence: event.sequence, realtimeDelivered: false };
  } catch (error) {
    if (error instanceof AuthError && error.code === "AI_JOB_STATE_CONFLICT") {
      return { retry: false, ignored: true, conflict: true };
    }
    if (error instanceof AuthError && error.code === "AI_DAILY_LIMIT_REACHED") {
      await skipAiJob(env.DB_V2, job, "AI_DAILY_LIMIT_REACHED", now);
      if (job.job_type === "translation") await dispatchTranslationUnavailable(env, job, "AI_DAILY_LIMIT_REACHED", now);
      return { retry: false, skipped: "AI_DAILY_LIMIT_REACHED" };
    }
    const code = String(error?.aiCode || error?.code || "AI_PROVIDER_FAILED").slice(0, 80);
    const retryable = shouldRetryAiJob(job, error, code);
    const failed = await failOrRetryAiJob(env.DB_V2, job, code, retryable, now);
    if (failed.retry && job.job_type === "translation" && Number(job.attempt_count) === 1 && isTranslationDelay(code)) {
      await dispatchTranslationUnavailable(env, job, "TRANSLATION_DELAYED", now);
    } else if (!failed.retry && job.job_type === "translation") {
      await dispatchTranslationUnavailable(env, job, code, now);
    }
    return { ...failed, errorCode: code };
  }
}

export async function recoverAndDispatchAiJobs(env, options = {}) {
  if (!env?.DB_V2) return { queued: 0, dispatched: 0 };
  const jobs = await listDueAiJobs(env.DB_V2, options);
  return { queued: jobs.length, dispatched: await dispatchAiJobs(env, jobs) };
}

async function dispatchTranslationUnavailable(env, job, reason, now = Date.now()) {
  try {
    const event = await appendRealtimeEvent(env.DB_V2, {
      organizationId: job.organization_id,
      liveSessionId: job.live_session_id,
      eventType: "settings:update",
      sourceCommentId: job.comment_id,
      payload: {
        type: "translation:unavailable",
        commentId: job.comment_id,
        targetLanguage: job.target_language || "",
        reason,
        comment: translationCommentPayload(job)
      },
      now
    });
    await dispatchTranslationRealtime(env, job.live_session_id, event);
    return event;
  } catch (error) {
    console.error("Translation unavailable delivery failed", safeCode(error));
    return null;
  }
}

async function dispatchTranslationRealtime(env, sessionId, event) {
  return dispatchRealtimeEvent(env, sessionId, event, false);
}

function normalizeJobId(value) {
  const text = String(value || "").trim();
  return /^aij_[A-Za-z0-9_-]{16,128}$/.test(text) ? text : "";
}

function parseFilterContext(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.slice(0, 20) : [];
  } catch {
    return [];
  }
}

function shouldRetryAiJob(job, error, code) {
  if (!error?.retryable) return false;
  if (job?.job_type !== "translation") return true;
  return new Set([
    "AI_PERSISTENCE_FAILED",
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED"
  ]).has(code);
}

function isTranslationDelay(code) {
  return new Set([
    "AI_PROVIDER_RATE_LIMITED",
    "AI_PROVIDER_TIMEOUT",
    "AI_PROVIDER_UNAVAILABLE",
    "AI_PROVIDER_FAILED"
  ]).has(code);
}

function safeCode(error) {
  return String(error?.aiCode || error?.code || error?.name || "ERROR").slice(0, 80);
}
