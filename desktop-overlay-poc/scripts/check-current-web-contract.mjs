import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const expectedWebVersion = '0.8.10';
const root = resolve(process.argv[2] || '..');

const files = {
  readme: read('README.md'),
  adminHtml: read('public/admin/index.html'),
  adminJs: read('public/assets/admin.js'),
  viewerHtml: read('public/viewer/index.html'),
  viewerJs: read('public/assets/viewer.js'),
  desktopOverlay: read('desktop-overlay-poc/src-tauri/scripts/overlay.js'),
  worker: read('src/index.js'),
  wrangler: read('wrangler.toml')
};

const failures = [];

expect(files.readme, `# Class PDF Comment Viewer v${expectedWebVersion}`, 'README version');
expect(files.wrangler, 'name = "class-pdf-comment-viewer-v01"', 'production Worker name');
expect(files.wrangler, 'AUTH_ORIGIN = "https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev"', 'production auth origin');

for (const id of [
  'commentsState',
  'toggleCommentsButton',
  'openViewerButton',
  'activeSessionList',
  'sessionSection'
]) {
  expectId(files.adminHtml, id, `admin DOM #${id}`);
}

for (const marker of [
  '/api/auth/session',
  '/api/private/sessions',
  'commentsVisible',
  'openViewerButton'
]) {
  expect(files.adminJs, marker, `admin contract ${marker}`);
}

for (const id of [
  'viewerStage',
  'pdfStage',
  'emptyDocument',
  'topBar',
  'pdfPageControls',
  'commentPanel',
  'commentList',
  'scrollCommentLayer',
  'qrOverlay',
  'qrCorner',
  'qrCornerImage',
  'viewerLogin',
  'connectionState'
]) {
  expectId(files.viewerHtml, id, `viewer DOM #${id}`);
}

for (const marker of [
  '/api/auth/session',
  '/api/private/sessions/',
  'commentDisplayMode',
  'applyDisplayMode',
  'scroll-mode',
  'setJoinQr',
  'qrCornerImage'
]) {
  expect(files.viewerJs, marker, `viewer contract ${marker}`);
}

for (const marker of [
  "getElementById('qrCorner')",
  "getElementById('qrCornerImage')",
  'applyQrVisibility',
  'setQrVisible(value)'
]) {
  expect(files.desktopOverlay, marker, `Desktop QR contract ${marker}`);
}
reject(
  files.desktopOverlay,
  "hide(document.getElementById('qrCorner'))",
  'Desktop overlay must not suppress the persistent QR corner'
);

for (const marker of [
  'path.startsWith("/api/auth/")',
  'path.startsWith("/api/private/")',
  'path === "/admin" || path.startsWith("/admin/")',
  'path.startsWith("/viewer/")'
]) {
  expect(files.worker, marker, `Worker route ${marker}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  console.error(`CPCV Desktop is not compatible with the checked web tree: ${root}`);
  process.exit(1);
}

console.log(`CPCV Desktop web contract verified for CPCV ${expectedWebVersion}: ${root}`);

function read(path) {
  try {
    return readFileSync(resolve(root, path), 'utf8');
  } catch (error) {
    console.error(`[FAIL] cannot read ${path}: ${error.message}`);
    process.exit(2);
  }
}

function expect(content, marker, label) {
  if (!content.includes(marker)) failures.push(`${label} is missing`);
}

function reject(content, marker, label) {
  if (content.includes(marker)) failures.push(label);
}

function expectId(content, id, label) {
  const doubleQuoted = `id="${id}"`;
  const singleQuoted = `id='${id}'`;
  if (!content.includes(doubleQuoted) && !content.includes(singleQuoted)) {
    failures.push(`${label} is missing`);
  }
}
