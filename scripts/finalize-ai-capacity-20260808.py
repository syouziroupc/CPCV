from pathlib import Path
import re


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"missing anchor: {label} in {path}")
    p.write_text(s.replace(old, new, 1))


# Provider: expose explicit queue-batch moderation entrypoint and use a clearly named
# Text Generation limiter. Translation has no redundant outer ingress limiter.
replace_once(
    "src/ai/provider.js",
    'export { runModerationModel } from "./moderation-classifier.js";',
    'export { runModerationBatchModel, runModerationModel } from "./moderation-classifier.js";',
    "provider moderation export",
)
replace_once(
    "src/ai/provider.js",
    "const limiter = env?.AI_MODERATION_RATE_LIMITER;",
    "const limiter = env?.AI_TEXT_GENERATION_RATE_LIMITER;",
    "provider text-generation limiter",
)

# Legacy moderation provider is retained only as an explicit compatibility fallback.
# It shares the same Text Generation task limiter name so the 300-RPM task cannot be
# exceeded by a mix of translation overflow and legacy moderation.
replace_once(
    "src/ai/provider-base.js",
    'const SHARED_TEXT_GENERATION_KEY = "workers-ai-moderation";',
    'const SHARED_TEXT_GENERATION_KEY = "workers-ai-text-generation";',
    "legacy text-generation key",
)
replace_once(
    "src/ai/provider-base.js",
    "const limiter = env?.AI_MODERATION_RATE_LIMITER;",
    "const limiter = env?.AI_TEXT_GENERATION_RATE_LIMITER || env?.AI_MODERATION_RATE_LIMITER;",
    "legacy text-generation limiter",
)

# Processor: batching belongs at the Queue batch boundary, not in module-global state
# or per-job provider calls. Remove the redundant translation ingress limiter and the
# legacy queue fallback path.
p = Path("src/ai/processor.js")
s = p.read_text()
s = s.replace(
    'import { runModerationModel, runTranslationModel } from "./provider.js";',
    'import { runModerationBatchModel, runModerationModel, runTranslationModel } from "./provider.js";',
    1,
)
old = '''export async function dispatchAiJobs(env, jobs) {
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
'''
new = '''export async function dispatchAiJobs(env, jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return 0;

  const groups = {
    [QUEUE_KIND_TRANSLATION]: [],
    [QUEUE_KIND_MODERATION]: []
  };
  for (const job of jobs) {
    const jobId = normalizeJobId(job?.id);
    if (!jobId) continue;
    const message = { body: { jobId } };
    if (job?.jobType === QUEUE_KIND_TRANSLATION) groups[QUEUE_KIND_TRANSLATION].push(message);
    else if (job?.jobType === QUEUE_KIND_MODERATION) groups[QUEUE_KIND_MODERATION].push(message);
  }

  const dispatched = await Promise.all([
    sendQueueMessages(env?.AI_TRANSLATION_QUEUE, groups[QUEUE_KIND_TRANSLATION], QUEUE_KIND_TRANSLATION),
    sendQueueMessages(env?.AI_MODERATION_QUEUE, groups[QUEUE_KIND_MODERATION], QUEUE_KIND_MODERATION)
  ]);
  return dispatched.reduce((total, result) => total + result.sent, 0);
}
'''
if old not in s:
    raise SystemExit("missing dispatchAiJobs legacy queue anchor")
s = s.replace(old, new, 1)

old = '''export async function processAiQueueBatch(batch, env) {
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
'''
new = '''export async function processAiQueueBatch(batch, env) {
  const messages = Array.from(batch?.messages || []);
  if (!messages.length) return;
  const queueKind = queueKindFromName(batch?.queue);
  if (queueKind === QUEUE_KIND_MODERATION && String(env?.AI_MODERATION_CLASSIFIER_MODEL || "").trim()) {
    await processModerationQueueBatch(messages, env);
    return;
  }
  const parallelism = queueParallelism(env, queueKind, messages.length);
  await runWithConcurrency(messages, parallelism, (message) => processAiQueueMessage(message, env, queueKind));
}

async function processModerationQueueBatch(messages, env) {
  const parallelism = queueParallelism(env, QUEUE_KIND_MODERATION, messages.length);
  const prepared = new Array(messages.length);
  await runWithConcurrency(messages, parallelism, async (message, index) => {
    try {
      prepared[index] = await prepareModerationQueueMessage(message, env);
    } catch (error) {
      console.error("AI moderation queue preparation failed", safeCode(error));
      prepared[index] = { message, kind: "done", outcome: { retry: true, delaySeconds: 30 } };
    }
  });

  for (const item of prepared) {
    if (item?.kind === "done") settleQueueMessage(item.message, item.outcome);
  }

  const candidates = prepared.filter((item) => item?.kind === "provider");
  if (!candidates.length) return;

  const model = String(env?.AI_MODERATION_CLASSIFIER_MODEL || "").trim();
  const usage = await Promise.allSettled(candidates.map((item) =>
    reserveAiUsage(env.DB_V2, item.job, item.now, model)
  ));
  const ready = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const reservation = usage[index];
    if (reservation.status === "fulfilled") {
      ready.push({ ...candidate, usageEventId: reservation.value });
      continue;
    }
    const outcome = await failPreparedModerationJob(env, candidate.job, reservation.reason, candidate.now);
    settleQueueMessage(candidate.message, outcome);
  }
  if (!ready.length) return;

  let results;
  try {
    results = await runModerationBatchModel(
      env,
      ready.map((item) => item.input),
      { usageEventIds: ready.map((item) => item.usageEventId), allowFallback: false }
    );
    if (!Array.isArray(results) || results.length !== ready.length) {
      const error = new Error("AI_RESPONSE_INVALID");
      error.aiCode = "AI_RESPONSE_INVALID";
      error.retryable = true;
      throw error;
    }
  } catch (error) {
    await Promise.all(ready.map(async (item) => {
      const outcome = await failPreparedModerationJob(env, item.job, error, Date.now());
      settleQueueMessage(item.message, outcome);
    }));
    return;
  }

  await Promise.all(ready.map(async (item, index) => {
    try {
      const result = results[index];
      const categories = item.privacy.promptInjection
        ? [...new Set([...result.categories, "prompt_injection"])]
        : result.categories;
      await completeModerationJob(env.DB_V2, {
        job: item.job,
        recommendation: result.recommendation,
        confidenceMilli: result.confidenceMilli,
        categories,
        source: "provider",
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        outputCharacters: result.rawOutputLength,
        usageEventId: item.usageEventId,
        now: Date.now()
      });
      settleQueueMessage(item.message, { retry: false, completed: true });
    } catch (error) {
      const outcome = await failPreparedModerationJob(env, item.job, error, Date.now());
      settleQueueMessage(item.message, outcome);
    }
  }));
}

async function prepareModerationQueueMessage(message, env) {
  const now = Date.now();
  const jobId = normalizeJobId(message?.body?.jobId ?? message?.body);
  if (!jobId) return { message, kind: "done", outcome: { retry: false, ignored: true } };

  const job = await claimAiJob(env.DB_V2, jobId, now);
  if (!job) return { message, kind: "done", outcome: { retry: false, ignored: true } };
  if (job.job_type !== QUEUE_KIND_MODERATION) {
    const failed = await failOrRetryAiJob(env.DB_V2, job, "AI_QUEUE_KIND_MISMATCH", false, now);
    return { message, kind: "done", outcome: { ...failed, errorCode: "AI_QUEUE_KIND_MISMATCH" } };
  }
  if (Date.parse(job.retained_until || "") <= now) {
    await skipAiJob(env.DB_V2, job, "COMMENT_EXPIRED", now);
    return { message, kind: "done", outcome: { retry: false, skipped: "COMMENT_EXPIRED" } };
  }
  if (!job.organization_ai_enabled || job.organization_status !== "active") {
    await skipAiJob(env.DB_V2, job, "AI_DISABLED", now);
    return { message, kind: "done", outcome: { retry: false, skipped: "AI_DISABLED" } };
  }
  if (job.moderation_state === "deleted") {
    await skipAiJob(env.DB_V2, job, "COMMENT_DELETED", now);
    return { message, kind: "done", outcome: { retry: false, skipped: "COMMENT_DELETED" } };
  }
  const unsupportedAiReview = Boolean(job.session_filter_enabled)
    && Boolean(job.unsupported_language)
    && job.unsupported_language_mode === "ai_review";
  if (!job.session_moderation_enabled && !unsupportedAiReview) {
    await skipAiJob(env.DB_V2, job, "AI_DISABLED", now);
    return { message, kind: "done", outcome: { retry: false, skipped: "AI_DISABLED" } };
  }

  const privacy = inspectCommentPrivacy(job.message);
  if (privacy.sensitive) {
    await completePrivacyGuardModeration(env.DB_V2, { job, promptInjection: privacy.promptInjection, now });
    return { message, kind: "done", outcome: { retry: false, completed: true, source: "local_privacy_guard" } };
  }

  return {
    message,
    kind: "provider",
    job,
    now,
    privacy,
    input: {
      message: job.message,
      promptInjection: privacy.promptInjection,
      dictionaryCandidates: parseFilterContext(job.filter_context_json)
    }
  };
}

async function failPreparedModerationJob(env, job, error, now = Date.now()) {
  if (error instanceof AuthError && error.code === "AI_JOB_STATE_CONFLICT") {
    return { retry: false, ignored: true, conflict: true };
  }
  if (error instanceof AuthError && error.code === "AI_DAILY_LIMIT_REACHED") {
    await skipAiJob(env.DB_V2, job, "AI_DAILY_LIMIT_REACHED", now);
    return { retry: false, skipped: "AI_DAILY_LIMIT_REACHED" };
  }
  const code = String(error?.aiCode || error?.code || "AI_PROVIDER_FAILED").slice(0, 80);
  const retryable = shouldRetryAiJob(job, error, code);
  const failed = await failOrRetryAiJob(env.DB_V2, job, code, retryable, now);
  return { ...failed, errorCode: code };
}

function settleQueueMessage(message, outcome) {
  if (outcome?.retry) message?.retry?.({ delaySeconds: outcome.delaySeconds });
  else message?.ack?.();
}

async function processAiQueueMessage(message, env, queueKind) {
  try {
    const jobId = normalizeJobId(message?.body?.jobId ?? message?.body);
    if (!jobId) {
      message?.ack?.();
      return;
    }
    const outcome = await processAiJob(env, jobId);
    settleQueueMessage(message, outcome);
  } catch (error) {
    console.error("AI queue message failed", safeCode(error));
    message?.retry?.({ delaySeconds: 30 });
  }
}
'''
if old not in s:
    raise SystemExit("missing queue batch processing anchor")
s = s.replace(old, new, 1)
# Concurrency helper must expose index to preparation workers.
s = s.replace(
    "      await worker(items[index]);",
    "      await worker(items[index], index);",
    1,
)
p.write_text(s)

# Classifier: structured batch-only observability without request data.
p = Path("src/ai/moderation-classifier.js")
s = p.read_text()
anchor = '''  const response = await withTimeout(
    Promise.resolve(
      env.AI.run('''
replacement = '''  console.log(JSON.stringify({ event: "ai_moderation_batch", model, size: messages.length }));
  const response = await withTimeout(
    Promise.resolve(
      env.AI.run('''
if anchor not in s:
    raise SystemExit("missing classifier observability anchor")
s = s.replace(anchor, replacement, 1)
p.write_text(s)

# Wrangler runtime cleanup.
w = Path("wrangler.toml")
s = w.read_text()
legacy_queue = '''# Legacy queue remains bound so messages created by an older deployment can drain safely.
[[queues.producers]]
binding = "AI_JOBS_QUEUE"
queue = "cpcv-ai-jobs"

[[queues.consumers]]
queue = "cpcv-ai-jobs"
max_batch_size = 10
max_batch_timeout = 0
max_retries = 3

'''
if legacy_queue not in s:
    raise SystemExit("missing legacy queue block")
s = s.replace(legacy_queue, "", 1)
s = s.replace('max_batch_size = 10\nmax_batch_timeout = 0\nmax_retries = 100\ndead_letter_queue = "cpcv-ai-moderation-dlq"',
              'max_batch_size = 20\nmax_batch_timeout = 1\nmax_retries = 6\ndead_letter_queue = "cpcv-ai-moderation-dlq"', 1)
s = s.replace('max_batch_size = 3\nmax_batch_timeout = 0\nmax_retries = 100\ndead_letter_queue = "cpcv-ai-translation-dlq"',
              'max_batch_size = 6\nmax_batch_timeout = 0\nmax_retries = 18\ndead_letter_queue = "cpcv-ai-translation-dlq"', 1)
translation_ingress = '''# Translation ingress is allowed above the dedicated Translation task ceiling so
# provider routing can overflow saturated M2M100 traffic into the separately
# limited Text Generation lane. The dedicated lane remains below Cloudflare's
# 720 RPM Translation limit.
[[ratelimits]]
name = "AI_TRANSLATION_RATE_LIMITER"
namespace_id = "826071905" # translation ingress capacity
simple = { limit = 990, period = 60 }

'''
if translation_ingress not in s:
    raise SystemExit("missing redundant translation ingress limiter")
s = s.replace(translation_ingress, "", 1)
s = s.replace('name = "AI_MODERATION_RATE_LIMITER"\nnamespace_id = "826071906" # shared Text Generation capacity',
              'name = "AI_TEXT_GENERATION_RATE_LIMITER"\nnamespace_id = "826071906" # shared Text Generation capacity', 1)
s = s.replace('AI_MODERATION_MODEL_BATCH_SIZE = "20"\nAI_MODERATION_BATCH_WINDOW_MS = "8"\n', "", 1)
s = s.replace('AI_MODERATION_REVIEW_SCORE = "0.46"', 'AI_MODERATION_REVIEW_SCORE = "0.68"', 1)
s = s.replace('AI_MODERATION_HIDE_SCORE = "0.78"', 'AI_MODERATION_HIDE_SCORE = "0.90"', 1)
s = s.replace('AI_MODERATION_CLASSIFIER_FALLBACK = "1"', 'AI_MODERATION_CLASSIFIER_FALLBACK = "0"', 1)
s = s.replace('AI_QUEUE_PARALLELISM = "5"\n', "", 1)
s = s.replace('AI_TRANSLATION_QUEUE_PARALLELISM = "3"', 'AI_TRANSLATION_QUEUE_PARALLELISM = "6"', 1)
s = s.replace('AI_MODERATION_QUEUE_PARALLELISM = "10"', 'AI_MODERATION_QUEUE_PARALLELISM = "20"', 1)
w.write_text(s)

# Regression expectations for the cleaned runtime.
t = Path("scripts/test-load-hardening.mjs")
s = t.read_text()
s = s.replace('import { runModerationModel } from "../src/ai/moderation-classifier.js";',
              'import { runModerationBatchModel, runModerationModel } from "../src/ai/moderation-classifier.js";', 1)
s = s.replace('const aiProvider = read("src/ai/provider.js");',
              'const aiProvider = read("src/ai/provider.js");\nconst aiProcessor = read("src/ai/processor.js");', 1)
s = s.replace('assert.match(translationConsumer, /max_batch_size = 3/);', 'assert.match(translationConsumer, /max_batch_size = 6/);', 1)
s = s.replace('assert.match(moderationConsumer, /max_batch_size = 10/);', 'assert.match(moderationConsumer, /max_batch_size = 20/);', 1)
s = s.replace('assert.match(wrangler, /AI_MODERATION_QUEUE_PARALLELISM = "10"/);', 'assert.match(wrangler, /AI_MODERATION_QUEUE_PARALLELISM = "20"/);', 1)
s = s.replace('assert.match(wrangler, /AI_MODERATION_MODEL_BATCH_SIZE = "20"/);\nassert.match(wrangler, /AI_MODERATION_BATCH_WINDOW_MS = "8"/);\n', '', 1)
s = s.replace('assert.match(moderationClassifier, /batchStates = new WeakMap/);',
              'assert.doesNotMatch(moderationClassifier, /batchStates|WeakMap/);\nassert.match(moderationClassifier, /runModerationBatchModel/);\nassert.match(aiProcessor, /processModerationQueueBatch/);', 1)
s = s.replace('assert.match(wrangler, /name = "AI_TRANSLATION_RATE_LIMITER"[\\s\\S]*?limit = 990/);\n', '', 1)
s = s.replace('assert.match(wrangler, /name = "AI_MODERATION_RATE_LIMITER"[\\s\\S]*?limit = 290/);',
              'assert.match(wrangler, /name = "AI_TEXT_GENERATION_RATE_LIMITER"[\\s\\S]*?limit = 290/);', 1)
s = s.replace('assert.match(wrangler, /AI_MODERATION_REVIEW_SCORE = "0\\.46"/);', 'assert.match(wrangler, /AI_MODERATION_REVIEW_SCORE = "0\\.68"/);', 1)
s = s.replace('assert.match(wrangler, /AI_MODERATION_HIDE_SCORE = "0\\.78"/);', 'assert.match(wrangler, /AI_MODERATION_HIDE_SCORE = "0\\.90"/);', 1)
s = s.replace('const batchedResults = await Promise.all(\n  Array.from({ length: 8 }, (_, index) => runModerationModel(batchedEnv, {\n    message: `Safe classroom batch comment ${index}.`\n  }))\n);',
              'const batchedResults = await runModerationBatchModel(\n  batchedEnv,\n  Array.from({ length: 8 }, (_, index) => ({ message: `Safe classroom batch comment ${index}.` })),\n  { usageEventIds: new Array(8).fill(null), allowFallback: false }\n);', 1)
s = s.replace('assert.equal(batchedCalls, 1, "concurrent moderation comments should share one text-classification request");',
              'assert.equal(batchedCalls, 1, "one Queue batch should use one text-classification request");', 1)
t.write_text(s)

# Translation resilience tests: named per-task limiters, no redundant outer limiter.
t = Path("scripts/test-ai-translation-resilience.mjs")
s = t.read_text()
s = s.replace('AI_MODERATION_RATE_LIMITER', 'AI_TEXT_GENERATION_RATE_LIMITER')
s = s.replace('moderationLimiterFailureFailsClosed', 'textGenerationLimiterFailureFailsClosed')
s = s.replace('legacyModerationLimiterFailureFailsClosed', 'legacyTextGenerationLimiterFailureFailsClosed')
t.write_text(s)

# Static assertions: no legacy runtime queue, no redundant translation ingress limiter,
# no global batching state, and bounded retry counts.
cleanup_test = Path("scripts/test-ai-runtime-cleanup.mjs")
cleanup_test.write_text('''import assert from "node:assert/strict";\nimport { readFileSync } from "node:fs";\nconst read=(p)=>readFileSync(new URL(`../${p}`,import.meta.url),"utf8");\nconst wrangler=read("wrangler.toml");\nconst processor=read("src/ai/processor.js");\nconst classifier=read("src/ai/moderation-classifier.js");\nassert.doesNotMatch(wrangler,/AI_JOBS_QUEUE|queue = "cpcv-ai-jobs"/);\nassert.doesNotMatch(wrangler,/AI_TRANSLATION_RATE_LIMITER/);\nassert.match(wrangler,/AI_TEXT_GENERATION_RATE_LIMITER[\\s\\S]*?limit = 290/);\nassert.match(wrangler,/queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?max_batch_size = 20[\\s\\S]*?max_batch_timeout = 1[\\s\\S]*?max_retries = 6/);\nassert.match(wrangler,/queue = "cpcv-ai-translation-jobs"[\\s\\S]*?max_batch_size = 6[\\s\\S]*?max_retries = 18/);\nassert.doesNotMatch(classifier,/batchStates|WeakMap/);\nassert.match(processor,/processModerationQueueBatch/);\nassert.doesNotMatch(processor,/AI_TRANSLATION_RATE_LIMITER|AI_JOBS_QUEUE/);\nconsole.log("AI runtime cleanup regression passed");\n''')

print("AI capacity finalizer applied")
