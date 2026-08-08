from pathlib import Path

exec(compile(Path("scripts/finalize-ai-capacity-v4-20260808.py").read_text(), "scripts/finalize-ai-capacity-v4-20260808.py", "exec"), {"__name__": "__main__"})

p = Path("scripts/test-v0810-usability.mjs")
s = p.read_text()
old = '''const translationQueueConfig = wrangler.match(/\\[\\[queues\\.consumers\\]\\][\\s\\S]*?queue = "cpcv-ai-translation-jobs"[\\s\\S]*?(?=\\n\\[\\[|$)/)?.[0] || '';
const moderationQueueConfig = wrangler.match(/\\[\\[queues\\.consumers\\]\\][\\s\\S]*?queue = "cpcv-ai-moderation-jobs"[\\s\\S]*?(?=\\n\\[\\[|$)/)?.[0] || '';'''
new = '''function queueConsumerConfig(queueName) {
  const header = '[[queues.consumers]]';
  const needle = `queue = "${queueName}"`;
  let offset = 0;
  while (offset < wrangler.length) {
    const start = wrangler.indexOf(header, offset);
    if (start < 0) return '';
    const next = wrangler.indexOf('\\n[[', start + header.length);
    const block = wrangler.slice(start, next < 0 ? wrangler.length : next);
    if (block.includes(needle)) return block;
    offset = next < 0 ? wrangler.length : next + 1;
  }
  return '';
}
const translationQueueConfig = queueConsumerConfig('cpcv-ai-translation-jobs');
const moderationQueueConfig = queueConsumerConfig('cpcv-ai-moderation-jobs');'''
if old not in s:
    raise SystemExit("dedicated Queue TOML parser anchor missing")
p.write_text(s.replace(old, new, 1))
print("dedicated Queue TOML parser fixed")
