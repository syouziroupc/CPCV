import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dispatchAiJobs } from '../src/ai/processor.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
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
check('AI queue dispatches without batch wait', wrangler.includes('max_batch_timeout = 0'));
check('AI queue consumer uses automatic horizontal scaling', !wrangler.includes('max_concurrency ='));
check('AI queue worker parallelism is bounded', wrangler.includes('AI_QUEUE_PARALLELISM = "5"'));
check('AI queue batch size supports burst throughput', wrangler.includes('max_batch_size = 10'));
check('translation uses the dedicated Workers AI model', wrangler.includes('AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"'));
check('dedicated translation timeout allows cold-start latency', wrangler.includes('AI_TRANSLATION_TIMEOUT_MS = "8000"'));

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
const appCss = `${text('public/assets/app-base.css')}\n${text('public/assets/app.css')}`;
check('mobile moderation table remains readable', appCss.includes('v0.8.10 compact table and header fixes') && appCss.includes('.moderation-table td:nth-child(8)::before'));
const radiusDeclarations = [...appCss.matchAll(/border-radius:\s*([^;]+);/gi)].map((match) => match[1].trim());
const allRadiusValuesAreZero = radiusDeclarations.length > 0 && radiusDeclarations.every((value) => {
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => /^0(?:px|rem|em|%|vh|vw)?$/i.test(token));
});
check('flat hierarchy removes rounded surfaces', appCss.includes('v0.8.10 flat hierarchy and tactile controls') && allRadiusValuesAreZero, radiusDeclarations.filter((value) => !value.split(/\s+/).every((token) => /^0(?:px|rem|em|%|vh|vw)?$/i.test(token))));
check('mobile dictionary tables become cards', appCss.includes('.filter-table:not(.policy-table) td:nth-child(8)::before') && appCss.includes('.policy-table td:nth-child(5)::before'));
const sourceRecord = text('SOURCE_GIT_RECORD.txt');
check('source record identifies v0.8.10', sourceRecord.includes('Version: 0.8.10') && !sourceRecord.includes('Version: 0.8.2'));
check('account shortcut label is concise', admin.includes('>アカウント設定<') && !admin.includes('アカウント・辞書設定'));
check('initial lesson buttons describe their action', admin.includes('>投稿を停止<') && admin.includes('>コメントを隠す<'));
check('login uses one standalone auth shell', admin.includes('class="auth-shell admin-login-shell hidden"') && !admin.includes('class="section auth-panel"') && !admin.includes('class="card admin-shell"'));
check('login uses semantic form submission', admin.includes('id="teacherLoginForm"') && admin.includes('type="submit">ログイン') && text('public/assets/admin.js').includes("teacherLoginForm.addEventListener('submit'"));
check('login state removes application shell framing', appCss.includes('.admin-page.auth-view .admin-shell') && appCss.includes('v0.8.10 auth hierarchy and form debug'));
check('account settings avoid nested card framing', !account.includes('class="card wide account-shell"') && appCss.includes('.account-summary-grid > .info-box'));
check('public auth pages use shared auth shell', ['signup', 'forgot-password', 'reset-password'].every((name) => text(`public/${name}/index.html`).includes('class="auth-shell"')));
check('Turnstile uses responsive flexible sizing', text('public/assets/auth-public.js').includes('size: "flexible"'));
check('filter presets apply immediately without a select-and-apply step', account.includes('data-filter-preset="standard"') && !account.includes('id="organizationFilterPreset"') && organizationSettings.includes('async function applyPreset(name, buttonNode)'));
check('filter settings expose batch review mask and reject controls', account.includes('id="bulkReviewMinSeverity"') && account.includes('id="bulkMaskMinSeverity"') && account.includes('id="bulkRejectMinSeverity"') && account.includes('id="applyBulkPolicyButton"'));
check('manual policy edits switch the visible state to custom', organizationSettings.includes('function markCustomDirty') && organizationSettings.includes("setFilterMode('custom', true)") && organizationSettings.includes("select.addEventListener('change', () => markCustomDirty())"));
check('batch policy changes preserve category enablement', organizationSettings.includes("const policies = (filterData.policies || []).map((policy) => ({ ...policy, ...changes }))"));
check('policy thresholds validate review mask reject order', organizationSettings.includes('function policyOrderValid') && organizationSettings.includes('承認待ち ≤ 伏字 ≤ 投稿拒否'));
check('batch and category policy controls are separate flat sections', account.includes('class="workspace-detail policy-batch-section"') && account.includes('class="workspace-detail category-policy-detail"'));
check('filter controls use a strong flat visual hierarchy', appCss.includes('v0.8.10 filter preset and batch policy UX') && appCss.includes('.filter-preset-actions') && appCss.includes('.policy-batch-grid'));

const router = text('src/index.js');
for (const route of ['/about', '/guide', '/privacy']) check(`${route} has an explicit asset route`, router.includes(`path === "${route}"`));
for (const path of ['public/about/index.html', 'public/guide/index.html', 'public/privacy/index.html']) check(`${path} exists`, text(path).length > 100);

const failed = results.filter((result) => !result.ok).length;
console.log(`\nv0.8.10 debug test summary: ${results.length - failed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
