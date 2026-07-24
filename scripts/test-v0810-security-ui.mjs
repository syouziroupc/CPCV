import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeCommentInput } from '../src/comments/validation.js';
import { getOrCreateParticipantToken } from '../src/comments/cookies.js';
import { enforcePublicCommentEdgeLimit } from '../src/realtime/edge-rate-limit.js';
import { BASE_SECURITY_HEADERS } from '../src/security-headers.js';
import workerApp from '../src/index.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const results = [];
const text = (path) => readFileSync(resolve(root, path), 'utf8');
function check(name, condition, detail = '') {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  if (!ok && detail) console.error(detail);
}
async function rejects(name, fn, code) {
  try {
    await fn();
    check(name, false, 'No error was thrown.');
  } catch (error) {
    check(name, error?.code === code, error);
  }
}

const pkg = JSON.parse(text('package.json'));
const lock = JSON.parse(text('package-lock.json'));
check('package version is 0.8.10', pkg.version === '0.8.10');
check('package lock version is 0.8.10', lock.version === '0.8.10' && lock.packages?.['']?.version === '0.8.10');
check('versioning policy documents integer segment ordering', text('docs/versioning-policy.md').includes('0.10.1') && text('docs/versioning-policy.md').includes('整数'));
check('base responses prohibit referrer leakage', BASE_SECURITY_HEADERS['referrer-policy'] === 'no-referrer');

const validBase = { idempotencyKey: 'security_key_0001', message: '通常の投稿', nickname: '学生A' };
await rejects('message rejects bidirectional control characters', () => normalizeCommentInput({ ...validBase, message: `abc\u202Etxt` }), 'UNSAFE_TEXT_DIRECTION_CONTROL');
await rejects('nickname rejects bidirectional control characters', () => normalizeCommentInput({ ...validBase, nickname: `abc\u2066txt` }), 'UNSAFE_TEXT_DIRECTION_CONTROL');
await rejects('nickname rejects URL schemes', () => normalizeCommentInput({ ...validBase, nickname: 'https://x.jp' }), 'NICKNAME_URL_NOT_ALLOWED');
await rejects('nickname rejects domain-like advertising', () => normalizeCommentInput({ ...validBase, nickname: 'spam.example' }), 'NICKNAME_URL_NOT_ALLOWED');
check('normal nickname remains accepted', normalizeCommentInput(validBase).nickname === '学生A');

const participant = getOrCreateParticipantToken(new Request('https://example.test/api/public/sessions/ABC123'), { APP_ENV: 'production' }, 'ABC123');
check('participant cookie is HttpOnly and Secure', participant.setCookie.includes('HttpOnly') && participant.setCookie.includes('Secure'));
check('participant cookie expires near lesson duration', participant.setCookie.includes('Max-Age=28800') && !participant.setCookie.includes('2592000'));

const keys = [];
const limiterEnv = {
  APP_ENV: 'production',
  PUBLIC_RATE_LIMIT_PEPPER: 'test-only-rate-pepper',
  PUBLIC_COMMENT_RATE_LIMITER: { async limit({ key }) { keys.push(key); return { success: true }; } }
};
const tokenA = 'A'.repeat(43);
const tokenB = 'B'.repeat(43);
await enforcePublicCommentEdgeLimit(new Request('https://example.test', { headers: { 'cf-connecting-ip': '203.0.113.1' } }), limiterEnv, 'ABC123', tokenA);
await enforcePublicCommentEdgeLimit(new Request('https://example.test', { headers: { 'cf-connecting-ip': '203.0.113.2' } }), limiterEnv, 'ABC123', tokenA);
await enforcePublicCommentEdgeLimit(new Request('https://example.test', { headers: { 'cf-connecting-ip': '203.0.113.1' } }), limiterEnv, 'ABC123', tokenB);
check('rate limit follows participant rather than shared school IP', keys[0] === keys[1] && keys[0] !== keys[2]);
check('rate limit keys are pseudonymous', keys.every((key) => /^[a-f0-9]{64}$/.test(key)));

const worker = text('src/index.js');
check('QR API accepts only same-origin student join routes', worker.includes('QR_TARGET_FORBIDDEN') && worker.includes('target.origin !== url.origin') && worker.includes('^\\/j\\/'));
const qrContext = { waitUntil() {} };
const validQr = await workerApp.fetch(new Request('https://example.test/api/public/qr?text=https%3A%2F%2Fexample.test%2Fj%2FABC234'), {}, qrContext);
const externalQr = await workerApp.fetch(new Request('https://example.test/api/public/qr?text=https%3A%2F%2Fevil.example%2Fj%2FABC234'), {}, qrContext);
const viewerQr = await workerApp.fetch(new Request('https://example.test/api/public/qr?text=https%3A%2F%2Fexample.test%2Fviewer%2FABC234'), {}, qrContext);
check('QR API serves a valid student join link', validQr.status === 200 && String(validQr.headers.get('content-type')).includes('image/svg+xml'));
check('QR API rejects external and viewer targets', externalQr.status === 400 && viewerQr.status === 400);
check('QR SVG response is sandboxed', String(validQr.headers.get('content-security-policy')).includes("default-src 'none'") && validQr.headers.get('x-content-type-options') === 'nosniff');

const privateRoutes = text('src/routes/private-v2.js');
check('manual retention endpoint is removed', !privateRoutes.includes('/maintenance/comment-retention') && !privateRoutes.includes('parts[2] === "maintenance"'));
const lifecycle = text('src/routes/account-lifecycle.js');
check('account deletion anonymizes identifiers', lifecycle.includes('deletedLoginId') && lifecycle.includes('@invalid.example') && lifecycle.includes("display_name = 'Deleted user'"));
check('account deletion replaces credential material', lifecycle.includes('deletedHash') && lifecycle.includes('deletedSalt'));


const adminJs = text('public/assets/admin.js');
check('admin session list avoids dynamic innerHTML', !adminJs.includes('.innerHTML ='));
check('viewer opens without an opener reference', adminJs.includes("'noopener,noreferrer'") && adminJs.includes("target.origin !== location.origin"));
const joinHtml = text('public/j/index.html');
const viewerHtml = text('public/viewer/index.html');
check('student and viewer pages include skip links', joinHtml.includes('skip-link') && viewerHtml.includes('skip-link'));
check('student and viewer statuses are announced', joinHtml.includes('aria-live="polite"') && viewerHtml.includes('aria-live="polite"'));
const htmlAssetVersions = [...joinHtml.matchAll(/\?v=([^"']+)/g)].map((match) => match[1]);
check('student page asset versions match 0.8.10', htmlAssetVersions.length > 0 && htmlAssetVersions.every((value) => value === '0.8.10'));

const admin = text('public/admin/index.html');
const adminSpa = text('public/_admin_spa.html');
check('admin header uses a short account label', admin.includes('>アカウント設定<') && adminSpa.includes('>アカウント設定<'));
check('lesson action labels state the action', admin.includes('>投稿を停止<') && admin.includes('>コメントを隠す<'));
check('lesson control remains one two-column screen', admin.includes('session-command-center') && admin.includes('lesson-live-column') && admin.includes('lesson-settings-column'));
const appCss = text('public/assets/app.css');
const viewerJs = text('public/assets/viewer.js');
const privacy = text('public/privacy/index.html');
const guide = text('public/guide/index.html');
check('keyboard focus is visibly styled', appCss.includes(':focus-visible') && appCss.includes('outline: 3px solid #1d4ed8'));
check('compact tables switch before tablet overflow', appCss.includes('@media (max-width: 820px)') && appCss.includes('compact table and header fixes'));
check('local browser log cap is reduced', viewerJs.includes('MAX_LOCAL_LOG_ENTRIES = 2_000'));
check('privacy page explains retention and AI provider', privacy.includes('標準保持期間は30日') && privacy.includes('Cloudflare Workers AI') && privacy.includes('2,000件'));
check('guide uses the current account label', guide.includes('「アカウント設定」') && !guide.includes('アカウント・辞書設定'));

const failed = results.filter((result) => !result.ok).length;
console.log(`\nv0.8.10 security and UI test summary: ${results.length - failed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;
