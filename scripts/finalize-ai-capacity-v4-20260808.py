from pathlib import Path

# Apply all reviewed cleanup transformations, then update the final v0.8.10
# usability regression to the dedicated moderation/translation Queue topology.
exec(compile(Path("scripts/finalize-ai-capacity-v3-20260808.py").read_text(), "scripts/finalize-ai-capacity-v3-20260808.py", "exec"), {"__name__": "__main__"})

p = Path("scripts/test-v0810-usability.mjs")
s = p.read_text()
old = '''let batch = [];
const dispatched = await dispatchAiJobs({ AI_JOBS_QUEUE: { async sendBatch(messages) { batch = messages; } } }, [
  { id: 'aij_1234567890abcdef' }, { id: 'aij_fedcba0987654321' }
]);
check('AI jobs use one queue batch when available', dispatched === 2 && batch.length === 2, { dispatched, batch });
check('queue batch contains job IDs only', batch.every((message) => Object.keys(message.body).join() === 'jobId'), batch);

const wrangler = text('wrangler.toml');
check('AI queue dispatches without batch wait', wrangler.includes('max_batch_timeout = 0'));
check('AI queue consumer uses automatic horizontal scaling', !wrangler.includes('max_concurrency ='));
check('AI queue worker parallelism is bounded', wrangler.includes('AI_QUEUE_PARALLELISM = "5"'));
check('AI queue batch size supports burst throughput', wrangler.includes('max_batch_size = 10'));'''
new = '''const moderationBatch = [];
const translationBatch = [];
const dispatched = await dispatchAiJobs({
  AI_MODERATION_QUEUE: { async sendBatch(messages) { moderationBatch.push(...messages); } },
  AI_TRANSLATION_QUEUE: { async sendBatch(messages) { translationBatch.push(...messages); } }
}, [
  { id: 'aij_1234567890abcdef', jobType: 'moderation' },
  { id: 'aij_fedcba0987654321', jobType: 'translation' }
]);
const queuedMessages = [...moderationBatch, ...translationBatch];
check('AI jobs use dedicated queue batches when available', dispatched === 2 && moderationBatch.length === 1 && translationBatch.length === 1, { dispatched, moderationBatch, translationBatch });
check('queue batch contains job IDs only', queuedMessages.every((message) => Object.keys(message.body).join() === 'jobId'), queuedMessages);

const wrangler = text('wrangler.toml');
const translationQueueConfig = wrangler.match(/\\[\\[queues\\.consumers\\]\\][\\s\\S]*?queue = "cpcv-ai-translation-jobs"[\\s\\S]*?(?=\\n\\[\\[|$)/)?.[0] || '';
const moderationQueueConfig = wrangler.match(/\\[\\[queues\\.consumers\\]\\][\\s\\S]*?queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?(?=\\n\\[\\[|$)/)?.[0] || '';
check('translation queue dispatches without batch wait', translationQueueConfig.includes('max_batch_timeout = 0'));
check('moderation queue collects short burst batches', moderationQueueConfig.includes('max_batch_timeout = 1'));
check('AI queue consumers use automatic horizontal scaling', !wrangler.includes('max_concurrency ='));
check('AI queue worker parallelism is bounded per lane', wrangler.includes('AI_TRANSLATION_QUEUE_PARALLELISM = "6"') && wrangler.includes('AI_MODERATION_QUEUE_PARALLELISM = "20"'));
check('AI queue batch sizes match lane workloads', translationQueueConfig.includes('max_batch_size = 6') && moderationQueueConfig.includes('max_batch_size = 20'));'''
if old not in s:
    raise SystemExit("v0.8.10 legacy queue regression anchor missing")
s = s.replace(old, new, 1)
p.write_text(s)
print("v0.8.10 dedicated Queue regression updated")
