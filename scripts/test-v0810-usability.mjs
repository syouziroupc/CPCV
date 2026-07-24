import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { dispatchAiJobs } from '../src/ai/processor.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const results = [];
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok && detail) console.error(detail);
}
const text = (path) => readFileSync(resolve(root, path), 'utf8');

let batch = [];
const dispatched = await dispatchAiJobs({ AI_JOBS_QUEUE: { async sendBatch(messages) { batch = messages; } } }, [
  { id: 'aij_1234567890abcdef' }, { id: 'aij_fedcba0987654321' }
]);
check('AI jobs use one queue batch when available', dispatched === 2 && batch.length === 2, { dispatched, batch });
check('queue batch contains job IDs only', batch.every((message) => Object.keys(message.body).join() === 'jobId'), batch);

const wrangler = text('wrangler.toml');
check('AI queue waits at most one second for a batch', wrangler.includes('max_batch_timeout = 1'));
check('AI queue consumer concurrency is bounded', wrangler.includes('max_concurrency = 3'));
check('AI queue worker parallelism is bounded', wrangler.includes('AI_QUEUE_PARALLELISM = "2"'));
check('AI queue batch size is bounded', wrangler.includes('max_batch_size = 5'));

const processor = text('src/ai/processor.js');
check('AI queue batch is processed with bounded concurrency', processor.includes('runWithConcurrency(messages, parallelism'));
const viewer = text('public/assets/viewer.js');
check('viewer tracks queued comment IDs', viewer.includes('const queuedCommentIds = new Set()'));
check('viewer tracks displayed comment IDs', viewer.includes('const shownCommentIds = new Set()'));
check('viewer updates queued duplicate instead of appending', viewer.includes('queue[queuedIndex] = { ...queue[queuedIndex], ...payload }'));

const admin = text('public/admin/index.html');
const account = text('public/account/index.html');
check('lesson controls use one two-column workspace', admin.includes('session-command-center') && admin.includes('lesson-live-column') && admin.includes('lesson-settings-column'));
check('organization dictionary is removed from lesson management', !admin.includes('id="organizationFilterSection"'));
check('organization dictionary is available from account settings', account.includes('id="organizationFilterSection"') && account.includes('id="filterTermInput"'));
check('organization AI limits are available from account settings', account.includes('id="organizationAiSection"'));
const organizationSettings = text('public/assets/organization-settings.js');
check('organization owners retain policy and pack controls', organizationSettings.includes('function ownerEditable()') && organizationSettings.includes("button.disabled = !ownerEditable() || current"));
check('organization admins can manage individual terms', organizationSettings.includes('function termEditable()') && organizationSettings.includes('active.disabled = !termEditable()') && organizationSettings.includes('edit.disabled = !termEditable()'));
check('pack installation reloads state after button cleanup', organizationSettings.indexOf('await withButton(button') < organizationSettings.indexOf('if (installed)') && organizationSettings.includes('await loadFilterSettings()'));
const appCss = text('public/assets/app.css');
check('mobile moderation table becomes cards', appCss.includes('v0.8.10 compact table and header fixes') && appCss.includes('.moderation-table td:nth-child(8)::before'));
check('mobile dictionary tables become cards', appCss.includes('.filter-table:not(.policy-table) td:nth-child(8)::before') && appCss.includes('.policy-table td:nth-child(5)::before'));
const sourceRecord = text('SOURCE_GIT_RECORD.txt');
check('source record identifies v0.8.10', sourceRecord.includes('Version: 0.8.10') && !sourceRecord.includes('Version: 0.8.2'));
check('account shortcut label is concise', admin.includes('>アカウント設定<') && !admin.includes('アカウント・辞書設定'));
check('initial lesson buttons describe their action', admin.includes('>投稿を停止<') && admin.includes('>コメントを隠す<'));

const router = text('src/index.js');
for (const route of ['/about', '/guide', '/privacy']) check(`${route} has an explicit asset route`, router.includes(`path === "${route}"`));
for (const path of ['public/about/index.html', 'public/guide/index.html', 'public/privacy/index.html']) check(`${path} exists`, text(path).length > 100);

const failed = results.filter((result) => !result.ok).length;
console.log(`\nv0.8.10 debug test summary: ${results.length - failed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
