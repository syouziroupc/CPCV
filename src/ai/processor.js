import { AuthError } from "../auth/errors.js";
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
  listDueAiJobs,
  reserveAiUsage,
  skipAiJob
} from "./repository.js";

export async function scheduleAiForComment(env, input) {
  if (!env?.DB_V2) return { jobs: [], dispatched: 0 };
  const jobs = await createAiJobsForComment(env.DB_V2, input);
  const dispatched = await dispatchAiJobs(env, jobs);
  return { jobs, dispatched };
}

export async function dispatchAiJobs(env, jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return 0;
  if (!env?.AI_JOBS_QUEUE || typeof env.AI_JOBS_QUEUE.send !== "function") return 0;
  let dispatched = 0;
  for (const job of jobs) {
    try {
      await env.AI_JOBS_QUEUE.send({ jobId: job.id });
      dispatched += 1;
    } catch (error) {
      console.error("AI queue dispatch failed", safeCode(error));
    }
  }
  return dispatched;
}

export async function processAiQueueBatch(batch, env) {
  for (const message of batch?.messages || []) {
    let outcome;
    try {
      const jobId = normalizeJobId(message?.body?.jobId ?? message?.body);
      if (!jobId) {
        message?.ack?.();
        continue;
      }
      outcome = await processAiJob(env, jobId);
      if (outcome.retry) message?.retry?.({ delaySeconds: outcome.delaySeconds });
      else message?.ack?.();
    } catch (error) {
      console.error("AI queue message failed", safeCode(error));
      message?.retry?.({ delaySeconds: 60 });
    }
  }
}

export async function processAiJob(env, jobId, options = {}) {
  if (!env?.DB_V2) throw new Error("DB_V2_NOT_CONFIGURED");
  const now = options.now ?? Date.now();
  const job = await claimAiJob(env.DB_V2, jobId, now);
  if (!job) return { retry: false, ignored: true };

  if (!job.organization_ai_enabled || job.organization_status !== "active") {
    await skipAiJob(env.DB_V2, job.id, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.moderation_state === "deleted") {
    await skipAiJob(env.DB_V2, job.id, "COMMENT_DELETED", now);
    return { retry: false, skipped: "COMMENT_DELETED" };
  }
  const unsupportedAiReview = Boolean(job.session_filter_enabled)
    && Boolean(job.unsupported_language)
    && job.unsupported_language_mode === "ai_review";
  if (job.job_type === "moderation" && !job.session_moderation_enabled && !unsupportedAiReview) {
    await skipAiJob(env.DB_V2, job.id, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.job_type === "translation" && !job.session_translation_enabled) {
    await skipAiJob(env.DB_V2, job.id, "AI_DISABLED", now);
    return { retry: false, skipped: "AI_DISABLED" };
  }
  if (job.job_type === "translation" && job.moderation_state !== "visible") {
    await skipAiJob(env.DB_V2, job.id, "COMMENT_NOT_VISIBLE", now);
    return { retry: false, skipped: "COMMENT_NOT_VISIBLE" };
  }
  if (job.job_type === "translation" && job.target_language !== job.session_target_language) {
    await skipAiJob(env.DB_V2, job.id, "AI_SETTING_CHANGED", now);
    return { retry: false, skipped: "AI_SETTING_CHANGED" };
  }

  const privacy = inspectCommentPrivacy(job.message);
  if (privacy.sensitive) {
    if (job.job_type === "moderation") {
      await completePrivacyGuardModeration(env.DB_V2, { job, promptInjection: privacy.promptInjection, now });
      return { retry: false, completed: true, source: "local_privacy_guard" };
    }
    await skipAiJob(env.DB_V2, job.id, "PII_DETECTED", now);
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
      targetLanguage: job.target_language
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
    await dispatchTranslationRealtime(env, job.live_session_id, event);
    return { retry: false, completed: true, sequence: event?.sequence || null };
  } catch (error) {
    if (error instanceof AuthError && error.code === "AI_DAILY_LIMIT_REACHED") {
      await skipAiJob(env.DB_V2, job.id, "AI_DAILY_LIMIT_REACHED", now);
      return { retry: false, skipped: "AI_DAILY_LIMIT_REACHED" };
    }
    const code = String(error?.aiCode || error?.code || "AI_PROVIDER_FAILED").slice(0, 80);
    const retryable = Boolean(error?.retryable);
    return failOrRetryAiJob(env.DB_V2, job, code, retryable, now);
  }
}

export async function recoverAndDispatchAiJobs(env, options = {}) {
  if (!env?.DB_V2) return { queued: 0, dispatched: 0 };
  const jobs = await listDueAiJobs(env.DB_V2, options);
  return { queued: jobs.length, dispatched: await dispatchAiJobs(env, jobs) };
}

async function dispatchTranslationRealtime(env, sessionId, event) {
  if (!event || !env?.COMMENT_ROOM) return false;
  try {
    const stub = env.COMMENT_ROOM.get(env.COMMENT_ROOM.idFromName(sessionId));
    const response = await stub.fetch("https://comment-room/event", {
      method: "POST",
      headers: { "content-type": "application/json", "x-realtime-internal": "true" },
      body: JSON.stringify({
        organizationId: event.organizationId,
        liveSessionId: event.liveSessionId,
        sequence: event.sequence
      })
    });
    return response.ok;
  } catch (error) {
    console.error("AI realtime dispatch failed", safeCode(error));
    return false;
  }
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

function safeCode(error) {
  return String(error?.aiCode || error?.code || error?.name || "ERROR").slice(0, 80);
}
