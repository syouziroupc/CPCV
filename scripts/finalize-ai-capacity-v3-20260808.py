from pathlib import Path
import re

# Operational finalizer. It applies the reviewed first pass, then rewrites every
# remaining legacy assumption using stable structural anchors. This file is removed
# before the candidate commit is pushed.
exec(compile(Path("scripts/finalize-ai-capacity-20260808.py").read_text(), "scripts/finalize-ai-capacity-20260808.py", "exec"), {"__name__": "__main__"})


def need(condition, message):
    if not condition:
        raise SystemExit(message)


# No phantom classifier usage when the classifier is not configured.
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
need(old in s, "classifier direct-run anchor missing")
p.write_text(s.replace(old, new, 1))

# Stage 7 harness now models the two dedicated queues. Keep one recorder object so
# existing assertions still verify all queued bodies without reintroducing a runtime
# legacy queue.
p = Path("scripts/test-ai-v2.mjs")
s = p.read_text()
replacements = [
    (
      'DB_V2: db, AI: ai, AI_JOBS_QUEUE: queue, COMMENT_ROOM: { idFromName: (id) => id, ...room },',
      'DB_V2: db, AI: ai, AI_TRANSLATION_QUEUE: queue, AI_MODERATION_QUEUE: queue, COMMENT_ROOM: { idFromName: (id) => id, ...room },',
      "Stage7 harness queue"
    ),
    (
      'const sent = await dispatchAiJobs({ AI_JOBS_QUEUE: { async send() { throw new Error("queue down"); } } }, [{ id: "aij_1234567890abcdef" }]);',
      'const sent = await dispatchAiJobs({ AI_MODERATION_QUEUE: { async send() { throw new Error("queue down"); } } }, [{ id: "aij_1234567890abcdef", jobType: "moderation" }]);',
      "Stage7 queue failure"
    ),
    (
      'const scheduled = await scheduleAiForComment({ DB_V2: h.db, AI_JOBS_QUEUE: { async send() { throw new Error("queue down"); } } }, {',
      'const scheduled = await scheduleAiForComment({ DB_V2: h.db, AI_TRANSLATION_QUEUE: { async send() { throw new Error("queue down"); } }, AI_MODERATION_QUEUE: { async send() { throw new Error("queue down"); } } }, {',
      "Stage7 schedule failure"
    )
]
for old, new, label in replacements:
    need(old in s, f"{label} anchor missing")
    s = s.replace(old, new, 1)
p.write_text(s)

# Translation resilience reflects task-level capacity instead of the removed outer
# queue-admission limiter.
p = Path("scripts/test-ai-translation-resilience.mjs")
s = p.read_text().replace("workers-ai-moderation", "workers-ai-text-generation")
start = s.find("function moderationIsNotDoubleCountedAtQueueAdmission() {")
need(start >= 0, "queue admission test start missing")
end = s.find("\n}\n", start)
need(end >= 0, "queue admission test end missing")
end += 3
replacement = '''function moderationIsNotDoubleCountedAtQueueAdmission() {
  const processor = readFileSync(new URL("../src/ai/processor.js", import.meta.url), "utf8");
  assert.doesNotMatch(processor, /AI_TRANSLATION_RATE_LIMITER|acquireQueueCapacity/);
  assert.match(processor, /processModerationQueueBatch/);
}
'''
s = s[:start] + replacement + s[end:]
s = s.replace('assert.match(wranglerSource, /AI_MODERATION_MODEL_BATCH_SIZE = "20"/);\n', '')
s = s.replace('assert.match(wranglerSource, /AI_MODERATION_BATCH_WINDOW_MS = "8"/);\n', '')
anchor = 'assert.match(wranglerSource, /AI_MODERATION_CLASSIFIER_MODEL = "@cf\\/baai\\/bge-reranker-base"/);\n'
need(anchor in s, "classifier assertion anchor missing")
s = s.replace(anchor, anchor + 'assert.match(wranglerSource, /queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?max_batch_size = 20[\\s\\S]*?max_batch_timeout = 1/);\n', 1)
p.write_text(s)

# AI readiness: replace the legacy single queue block by slicing between stable
# top-level statements; this avoids brittle regex escaping.
p = Path("scripts/verify-ai-readiness.mjs")
s = p.read_text()
start = s.find('const producer = arrayBlock(config, "queues.producers", "binding", "AI_JOBS_QUEUE");')
need(start >= 0, "AI readiness legacy block start missing")
end = s.find('\nfor (const name of ["AI_MODERATION_MODEL", "AI_TRANSLATION_MODEL"]) {', start)
need(end >= 0, "AI readiness model loop anchor missing")
queue_block = '''const requiredQueues = ["AI_TRANSLATION_QUEUE", "AI_MODERATION_QUEUE"];
const queueNames = [];
for (const binding of requiredQueues) {
  const producer = arrayBlock(config, "queues.producers", "binding", binding);
  const producerQueue = producer.match(/^queue\\s*=\\s*"([^"]+)"\\s*$/m)?.[1] || "";
  const consumerQueue = [...config.matchAll(/\\[\\[queues\\.consumers\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)/g)]
    .map((match) => match[0])
    .map((block) => block.match(/^queue\\s*=\\s*"([^"]+)"\\s*$/m)?.[1] || "")
    .find((queue) => queue === producerQueue) || "";
  if (!producerQueue) failures.push(`${binding} producer is missing.`);
  if (!consumerQueue) failures.push(`${binding} consumer is missing.`);
  if (producerQueue) queueNames.push(producerQueue);
}
if (new Set(queueNames).size !== queueNames.length) failures.push("AI queue bindings must use distinct queues.");
'''
s = s[:start] + queue_block + s[end:]
s = s.replace('for (const name of ["AI_MODERATION_MODEL", "AI_TRANSLATION_MODEL"]) {', 'for (const name of ["AI_MODERATION_CLASSIFIER_MODEL", "AI_TRANSLATION_MODEL"]) {', 1)
s = s.replace('console.log(`AI configuration is structurally ready. Verify remote queue ${producerQueue} and apply DB_V2 migration 0010 before cutover.`);', 'console.log(`AI configuration is structurally ready. Verify remote queues ${queueNames.join(", ")} and apply DB_V2 migration 0010 before cutover.`);', 1)
p.write_text(s)

# Environment separation: two dedicated queues and every limiter namespace are
# checked between prod/staging.
p = Path("scripts/verify-environment-separation.mjs")
s = p.read_text()
old_known = 'const knownProduction = { worker: "class-pdf-comment-viewer-v01", legacyDbId: "f11457fa-27af-468d-94cc-6cdf1ae814e4", queue: "cpcv-ai-jobs" };'
new_known = 'const knownProduction = { worker: "class-pdf-comment-viewer-v01", legacyDbId: "f11457fa-27af-468d-94cc-6cdf1ae814e4", queues: { AI_TRANSLATION_QUEUE: "cpcv-ai-translation-jobs", AI_MODERATION_QUEUE: "cpcv-ai-moderation-jobs" } };'
need(old_known in s, "environment known queue anchor missing")
s = s.replace(old_known, new_known, 1)
old_line = 'const stageQueue = queue(staging); required("staging queue producer", stageQueue.producer); if (stageQueue.producer !== stageQueue.consumer) failures.push("Staging queue producer and consumer must match."); different("known production Queue", knownProduction.queue, stageQueue.producer);'
new_lines = '''for (const binding of ["AI_TRANSLATION_QUEUE", "AI_MODERATION_QUEUE"]) {
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
need(old_line in s, "environment stage queue anchor missing")
s = s.replace(old_line, new_lines, 1)
pattern = re.compile(r'^function queue\(t\) \{.*?\}\nfunction limiterIds\(t\) \{.*?\}$', re.M)
match = pattern.search(s)
need(match is not None, "environment helper functions missing")
helpers = '''function queue(t, binding) {
  const producer = value(block(t, "queues.producers", "binding", binding), "queue");
  const consumer = [...t.matchAll(/\\[\\[queues\\.consumers\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)/g)]
    .map((m) => value(m[0], "queue"))
    .find((name) => name === producer) || "";
  return { producer, consumer };
}
function limiterIds(t) { return [...t.matchAll(/\\[\\[ratelimits\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)/g)].map((m) => value(m[0], "namespace_id")).filter(Boolean); }'''
s = s[:match.start()] + helpers + s[match.end():]
p.write_text(s)

# Deployment verifier fixtures use staging-dedicated queues and all AI namespaces.
p = Path("scripts/test-deployment-verifiers.mjs")
s = p.read_text()
old = ".replaceAll('queue = \"cpcv-ai-jobs\"', 'queue = \"cpcv-ai-jobs-staging\"')"
need(old in s, "deployment queue fixture missing")
s = s.replace(old, ".replaceAll('queue = \"cpcv-ai-translation-jobs\"', 'queue = \"cpcv-ai-translation-jobs-staging\"')\n    .replaceAll('queue = \"cpcv-ai-moderation-jobs\"', 'queue = \"cpcv-ai-moderation-jobs-staging\"')", 1)
anchor = '.replace(\'namespace_id = "826071904"\', \'namespace_id = "826071804"\');'
need(anchor in s, "deployment namespace fixture missing")
s = s.replace(anchor, '.replace(\'namespace_id = "826071904"\', \'namespace_id = "826071804"\')\n    .replace(\'namespace_id = "826071906"\', \'namespace_id = "826071806"\')\n    .replace(\'namespace_id = "826071907"\', \'namespace_id = "826071807"\')\n    .replace(\'namespace_id = "826071908"\', \'namespace_id = "826071808"\');', 1)
old = 'check("AI readiness accepts a separated staging queue", stagingAiTarget.status === 0 && stagingAiTarget.stdout.includes("cpcv-ai-jobs-staging"), stagingAiTarget);'
need(old in s, "deployment AI readiness assertion missing")
s = s.replace(old, 'check("AI readiness accepts separated staging queues", stagingAiTarget.status === 0 && stagingAiTarget.stdout.includes("cpcv-ai-translation-jobs-staging") && stagingAiTarget.stdout.includes("cpcv-ai-moderation-jobs-staging"), stagingAiTarget);', 1)
p.write_text(s)

# Correct stale performance commentary after the Queue config is rewritten.
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
need(old in s, "stale Queue comment missing")
p.write_text(s.replace(old, new, 1))

# Cleanup regression additionally protects against phantom classifier usage.
p = Path("scripts/test-ai-runtime-cleanup.mjs")
s = p.read_text()
anchor = 'assert.doesNotMatch(classifier,/batchStates|WeakMap/);'
need(anchor in s, "cleanup classifier anchor missing")
s = s.replace(anchor, anchor + '\nassert.match(classifier,/if \\(!configuredModel\\) return runLegacyModerationModel/);', 1)
p.write_text(s)

print("AI capacity v3 final cleanup applied")
