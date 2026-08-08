from pathlib import Path
import re

# Apply the already-reviewed first-pass finalizer, then repair the remaining
# verifier/test assumptions. This file is operational only and is deleted before
# the verified candidate is committed.
first = Path("scripts/finalize-ai-capacity-20260808.py")
exec(compile(first.read_text(), str(first), "exec"), {"__name__": "__main__"})


def replace_once(path, old, new, label):
    p = Path(path)
    text = p.read_text()
    if old not in text:
        raise SystemExit(f"missing anchor: {label} in {path}")
    p.write_text(text.replace(old, new, 1))


# 1. Do not reserve an imaginary classifier usage event when the classifier is
# disabled. Legacy tests/environments should go straight to the legacy provider.
p = Path("src/ai/moderation-classifier.js")
s = p.read_text()
old = '''export async function runModerationModel(env, input, options = {}) {
  const usageEventId = typeof options.reserveUsage === "function"
    ? await options.reserveUsage(primaryModel(env))
    : null;
  const [result] = await runModerationBatchModel(env, [input], {
    usageEventIds: [usageEventId],
    allowFallback: true,
    reserveFallbackUsage: typeof options.reserveUsage === "function"
      ? async (model) => options.reserveUsage(model)
      : null
  });
  return result;
}'''
new = '''export async function runModerationModel(env, input, options = {}) {
  const configuredModel = String(env?.AI_MODERATION_CLASSIFIER_MODEL || "").trim();
  if (!configuredModel) return runLegacyModerationModel(env, input, options);
  const usageEventId = typeof options.reserveUsage === "function"
    ? await options.reserveUsage(configuredModel)
    : null;
  const [result] = await runModerationBatchModel(env, [input], {
    usageEventIds: [usageEventId],
    allowFallback: true,
    reserveFallbackUsage: typeof options.reserveUsage === "function"
      ? async (model) => options.reserveUsage(model)
      : null
  });
  return result;
}'''
if old not in s:
    raise SystemExit("classifier direct-run usage anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

# 2. Stage 7 fixture uses the same dedicated Queue topology as production.
p = Path("scripts/test-ai-v2.mjs")
s = p.read_text()
old = 'DB_V2: db, AI: ai, AI_JOBS_QUEUE: queue, COMMENT_ROOM: { idFromName: (id) => id, ...room },'
new = 'DB_V2: db, AI: ai, AI_TRANSLATION_QUEUE: queue, AI_MODERATION_QUEUE: queue, COMMENT_ROOM: { idFromName: (id) => id, ...room },'
if old not in s:
    raise SystemExit("Stage 7 harness legacy queue anchor missing")
s = s.replace(old, new, 1)
old = 'const sent = await dispatchAiJobs({ AI_JOBS_QUEUE: { async send() { throw new Error("queue down"); } } }, [{ id: "aij_1234567890abcdef" }]);'
new = 'const sent = await dispatchAiJobs({ AI_MODERATION_QUEUE: { async send() { throw new Error("queue down"); } } }, [{ id: "aij_1234567890abcdef", jobType: "moderation" }]);'
if old not in s:
    raise SystemExit("Stage 7 queue failure fixture anchor missing")
s = s.replace(old, new, 1)
old = 'const scheduled = await scheduleAiForComment({ DB_V2: h.db, AI_JOBS_QUEUE: { async send() { throw new Error("queue down"); } } }, {'
new = 'const scheduled = await scheduleAiForComment({ DB_V2: h.db, AI_TRANSLATION_QUEUE: { async send() { throw new Error("queue down"); } }, AI_MODERATION_QUEUE: { async send() { throw new Error("queue down"); } } }, {'
if old not in s:
    raise SystemExit("Stage 7 scheduling fixture anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

# 3. Translation resilience tests: one shared Text Generation limiter name and
# no obsolete Queue-admission limiter layer.
p = Path("scripts/test-ai-translation-resilience.mjs")
s = p.read_text().replace("workers-ai-moderation", "workers-ai-text-generation")
old = '''function moderationIsNotDoubleCountedAtQueueAdmission() {
  const processor = readFileSync(new URL("../src/ai/processor.js", import.meta.url), "utf8");
  assert.match(processor, /if \(queueKind !== QUEUE_KIND_TRANSLATION\) return true;/);
}'''
new = '''function moderationIsNotDoubleCountedAtQueueAdmission() {
  const processor = readFileSync(new URL("../src/ai/processor.js", import.meta.url), "utf8");
  assert.doesNotMatch(processor, /AI_TRANSLATION_RATE_LIMITER|acquireQueueCapacity/);
  assert.match(processor, /processModerationQueueBatch/);
}'''
if old not in s:
    raise SystemExit("obsolete queue admission regression anchor missing")
s = s.replace(old, new, 1)
s = s.replace('assert.match(wranglerSource, /AI_MODERATION_MODEL_BATCH_SIZE = "20"/);\n', '')
s = s.replace('assert.match(wranglerSource, /AI_MODERATION_BATCH_WINDOW_MS = "8"/);\n', '')
anchor = 'assert.match(wranglerSource, /AI_MODERATION_CLASSIFIER_MODEL = "@cf\\/baai\\/bge-reranker-base"/);\n'
if anchor not in s:
    raise SystemExit("classifier wrangler assertion anchor missing")
s = s.replace(anchor, anchor + 'assert.match(wranglerSource, /queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?max_batch_size = 20[\\s\\S]*?max_batch_timeout = 1/);\n', 1)
p.write_text(s)

# 4. AI readiness verifies both dedicated queues, not a deleted legacy queue.
p = Path("scripts/verify-ai-readiness.mjs")
s = p.read_text()
old = '''const producer = arrayBlock(config, "queues.producers", "binding", "AI_JOBS_QUEUE");
const producerQueue = producer.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
const consumer = [...config.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)]
  .map((match) => match[0])
  .find((block) => /^queue\s*=\s*"([^"]+)"\s*$/m.test(block)) || "";
const consumerQueue = consumer.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
if (!producerQueue) failures.push("AI queue producer is missing.");
if (!consumerQueue) failures.push("AI queue consumer is missing.");
if (producerQueue && consumerQueue && producerQueue !== consumerQueue) failures.push("AI queue producer and consumer must use the same queue.");
'''
new = '''const requiredQueues = ["AI_TRANSLATION_QUEUE", "AI_MODERATION_QUEUE"];
const queueNames = [];
for (const binding of requiredQueues) {
  const producer = arrayBlock(config, "queues.producers", "binding", binding);
  const producerQueue = producer.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
  const consumerQueue = [...config.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)]
    .map((match) => match[0])
    .map((block) => block.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "")
    .find((queue) => queue === producerQueue) || "";
  if (!producerQueue) failures.push(`${binding} producer is missing.`);
  if (!consumerQueue) failures.push(`${binding} consumer is missing.`);
  if (producerQueue) queueNames.push(producerQueue);
}
if (new Set(queueNames).size !== queueNames.length) failures.push("AI queue bindings must use distinct queues.");
'''
if old not in s:
    raise SystemExit("AI readiness legacy queue anchor missing")
s = s.replace(old, new, 1)
s = s.replace('for (const name of ["AI_MODERATION_MODEL", "AI_TRANSLATION_MODEL"]) {', 'for (const name of ["AI_MODERATION_CLASSIFIER_MODEL", "AI_TRANSLATION_MODEL"]) {', 1)
s = s.replace('console.log(`AI configuration is structurally ready. Verify remote queue ${producerQueue} and apply DB_V2 migration 0010 before cutover.`);', 'console.log(`AI configuration is structurally ready. Verify remote queues ${queueNames.join(", ")} and apply DB_V2 migration 0010 before cutover.`);', 1)
p.write_text(s)

# 5. Environment separation verifies both queues and every rate-limit namespace,
# including AI task limiters. This makes future limit additions fail closed if a
# staging namespace is accidentally shared with production.
p = Path("scripts/verify-environment-separation.mjs")
s = p.read_text()
s = s.replace(
    'const knownProduction = { worker: "class-pdf-comment-viewer-v01", legacyDbId: "f11457fa-27af-468d-94cc-6cdf1ae814e4", queue: "cpcv-ai-jobs" };',
    'const knownProduction = { worker: "class-pdf-comment-viewer-v01", legacyDbId: "f11457fa-27af-468d-94cc-6cdf1ae814e4", queues: { AI_TRANSLATION_QUEUE: "cpcv-ai-translation-jobs", AI_MODERATION_QUEUE: "cpcv-ai-moderation-jobs" } };',
    1,
)
old = 'const stageQueue = queue(staging); required("staging queue producer", stageQueue.producer); if (stageQueue.producer !== stageQueue.consumer) failures.push("Staging queue producer and consumer must match."); different("known production Queue", knownProduction.queue, stageQueue.producer);'
new = '''for (const binding of ["AI_TRANSLATION_QUEUE", "AI_MODERATION_QUEUE"]) {
  const prodQueue = queue(production, binding), stageQueue = queue(staging, binding);
  required(`staging ${binding} producer`, stageQueue.producer);
  required(`staging ${binding} consumer`, stageQueue.consumer);
  if (stageQueue.producer && stageQueue.producer !== stageQueue.consumer) failures.push(`Staging ${binding} producer and consumer must match.`);
  different(`known production ${binding}`, knownProduction.queues[binding], stageQueue.producer);
  if (mode === "production-gate") {
    required(`production ${binding} producer`, prodQueue.producer);
    required(`production ${binding} consumer`, prodQueue.consumer);
    if (prodQueue.producer && prodQueue.producer !== prodQueue.consumer) failures.push(`Production ${binding} producer and consumer must match.`);
  }
  different(`${binding} queue`, prodQueue.producer, stageQueue.producer);
}'''
if old not in s:
    raise SystemExit("environment legacy queue anchor missing")
s = s.replace(old, new, 1)
old = '''function queue(t) { return { producer: value(block(t, "queues.producers", "binding", "AI_JOBS_QUEUE"), "queue"), consumer: value((t.match(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/) || [])[0] || "", "queue") }; }
function limiterIds(t) { return ["AUTH_LOGIN_IP_LIMITER", "AUTH_LOGIN_ACCOUNT_LIMITER", "PUBLIC_COMMENT_RATE_LIMITER", "AUTH_PUBLIC_EMAIL_LIMITER"].map((n) => value(block(t, "ratelimits", "name", n), "namespace_id")); }'''
new = '''function queue(t, binding) {
  const producer = value(block(t, "queues.producers", "binding", binding), "queue");
  const consumer = [...t.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)]
    .map((m) => value(m[0], "queue"))
    .find((name) => name === producer) || "";
  return { producer, consumer };
}
function limiterIds(t) { return [...t.matchAll(/\[\[ratelimits\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)].map((m) => value(m[0], "namespace_id")).filter(Boolean); }'''
if old not in s:
    raise SystemExit("environment queue helper anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

# 6. Deployment-verifier fixtures follow the dedicated staging resources.
p = Path("scripts/test-deployment-verifiers.mjs")
s = p.read_text()
old = ".replaceAll('queue = \"cpcv-ai-jobs\"', 'queue = \"cpcv-ai-jobs-staging\"')"
new = ".replaceAll('queue = \"cpcv-ai-translation-jobs\"', 'queue = \"cpcv-ai-translation-jobs-staging\"')\n    .replaceAll('queue = \"cpcv-ai-moderation-jobs\"', 'queue = \"cpcv-ai-moderation-jobs-staging\"')"
if old not in s:
    raise SystemExit("deployment verifier legacy queue fixture anchor missing")
s = s.replace(old, new, 1)
anchor = '''.replace('namespace_id = "826071904"', 'namespace_id = "826071804"');'''
replacement = '''.replace('namespace_id = "826071904"', 'namespace_id = "826071804"')
    .replace('namespace_id = "826071906"', 'namespace_id = "826071806"')
    .replace('namespace_id = "826071907"', 'namespace_id = "826071807"')
    .replace('namespace_id = "826071908"', 'namespace_id = "826071808"');'''
if anchor not in s:
    raise SystemExit("deployment verifier namespace fixture anchor missing")
s = s.replace(anchor, replacement, 1)
old = 'check("AI readiness accepts a separated staging queue", stagingAiTarget.status === 0 && stagingAiTarget.stdout.includes("cpcv-ai-jobs-staging"), stagingAiTarget);'
new = 'check("AI readiness accepts separated staging queues", stagingAiTarget.status === 0 && stagingAiTarget.stdout.includes("cpcv-ai-translation-jobs-staging") && stagingAiTarget.stdout.includes("cpcv-ai-moderation-jobs-staging"), stagingAiTarget);'
if old not in s:
    raise SystemExit("deployment verifier AI readiness fixture anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

# 7. Remove stale performance comments and keep exactly one source of truth for
# Queue batch sizing: the Queue consumer configuration itself.
p = Path("wrangler.toml")
s = p.read_text()
old = '''# Translation and moderation scale independently. max_concurrency is intentionally
# unset so Cloudflare Queues can autoscale consumers as backlog grows. Translation
# stays at the measured batch size 3. Moderation can safely fan out a larger batch
# because the primary path uses the independent high-RPM Text Classification task.'''
new = '''# Translation and moderation scale independently. max_concurrency is intentionally
# unset so Cloudflare Queues can autoscale consumers as backlog grows. Translation
# uses small low-latency batches; moderation collects up to 20 messages for one
# Text Classification call during bursts.'''
if old not in s:
    raise SystemExit("stale queue performance comment anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)

# 8. Strengthen cleanup regression: legacy queue names and phantom classifier usage
# must not reappear.
p = Path("scripts/test-ai-runtime-cleanup.mjs")
s = p.read_text()
s = s.replace(
    'assert.doesNotMatch(classifier,/batchStates|WeakMap/);',
    'assert.doesNotMatch(classifier,/batchStates|WeakMap/);\nassert.match(classifier,/if \(!configuredModel\) return runLegacyModerationModel/);',
    1,
)
p.write_text(s)

print("AI capacity final cleanup pass applied")
