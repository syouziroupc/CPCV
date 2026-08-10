import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUTPUT_DIR = resolve(ROOT, '.freeze-output');

const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: ROOT,
  encoding: 'utf8',
  stdio: options.capture === false ? 'inherit' : ['ignore', 'pipe', 'pipe'],
  ...options
});

const status = run('git', ['status', '--porcelain']).trim();
if (status) {
  console.error('Refusing to build a freeze bundle from a dirty working tree.');
  console.error(status);
  process.exit(1);
}

const commit = run('git', ['rev-parse', 'HEAD']).trim();
if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`Invalid Git commit: ${commit}`);

run(process.execPath, ['scripts/verify-source-manifest.mjs'], { capture: false });
run(process.execPath, ['scripts/verify-u22-freeze.mjs'], { capture: false });

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
const desktopPkg = JSON.parse(readFileSync(resolve(ROOT, 'desktop-overlay-poc/package.json'), 'utf8'));
const short = commit.slice(0, 12);
const zipName = `CPCV-U22-source-${pkg.version}-${short}.zip`;
const zipPath = resolve(OUTPUT_DIR, zipName);
const checksumPath = `${zipPath}.sha256`;
const manifestPath = resolve(OUTPUT_DIR, `CPCV-U22-freeze-manifest-${short}.txt`);

mkdirSync(OUTPUT_DIR, { recursive: true });
rmSync(zipPath, { force: true });
rmSync(checksumPath, { force: true });
rmSync(manifestPath, { force: true });

execFileSync('git', ['archive', '--format=zip', `--output=${zipPath}`, commit], { cwd: ROOT, stdio: 'inherit' });

const bytes = readFileSync(zipPath);
const hash = createHash('sha256').update(bytes).digest('hex');
writeFileSync(checksumPath, `${hash}  ${basename(zipPath)}\n`, 'ascii');

const trackedCount = run('git', ['ls-files']).trim().split(/\r?\n/).filter(Boolean).length;
const productionOrigin = 'https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev';
const manifest = [
  'CPCV U-22 FREEZE BUNDLE RECORD',
  `source_commit=${commit}`,
  `web_version=${pkg.version}`,
  `desktop_version=${desktopPkg.version}`,
  `production_origin=${productionOrigin}`,
  `tracked_files=${trackedCount}`,
  `source_zip=${basename(zipPath)}`,
  `source_zip_bytes=${statSync(zipPath).size}`,
  `source_zip_sha256=${hash}`,
  'desktop_exe_sha256=PENDING_EXTERNAL_GATE',
  'production_worker_version=PENDING_EXTERNAL_GATE',
  'production_alignment=PENDING_EXTERNAL_GATE',
  'physical_windows_acceptance=PENDING_EXTERNAL_GATE',
  'sample_pdf_sha256=PENDING_SUBMISSION_FREEZE',
  '',
  'This record intentionally contains no secret and no production user data.',
  'Production D1 backup/evidence is internal-only and must not be added to the contest source ZIP.',
  ''
].join('\n');
writeFileSync(manifestPath, manifest, 'utf8');

console.log(`Source bundle: ${zipPath}`);
console.log(`SHA-256: ${hash}`);
console.log(`Freeze record: ${manifestPath}`);
