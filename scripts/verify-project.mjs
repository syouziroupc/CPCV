import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'wrangler.toml',
  'package.json',
  'src/index.js',
  'src/routes/master.js',
  'src/lib/master-auth.js',
  'src/lib/password.js',
  'migrations/0001_init.sql',
  'migrations/0004_master_auth.sql',
  'migrations/0005_comment_display_mode.sql',
  'public/index.html',
  'public/_j_spa.html',
  'public/_viewer_spa.html',
  'public/_admin_spa.html',
  'public/master/index.html',
  'public/j/index.html',
  'public/viewer/index.html',
  'public/admin/index.html',
  'public/assets/app.css',
  'public/assets/home.js',
  'public/assets/join.js',
  'public/assets/viewer.js',
  'public/assets/admin.js',
  'public/assets/master.js',
  'public/assets/pdfjs/pdf.min.mjs',
  'public/assets/pdfjs/pdf.worker.min.mjs'
];

let failed = false;
for (const file of required) {
  const path = join(root, file);
  if (!existsSync(path)) {
    console.error(`missing: ${file}`);
    failed = true;
  }
}

const worker = readFileSync(join(root, 'src/index.js'), 'utf8');
for (const forbidden of ['innerHTML']) {
  if (worker.includes(forbidden)) {
    console.error(`forbidden token in worker: ${forbidden}`);
    failed = true;
  }
}

const migration = readFileSync(join(root, 'migrations/0001_init.sql'), 'utf8');
const wrangler = readFileSync(join(root, 'wrangler.toml'), 'utf8');
if (/CREATE TABLE IF NOT EXISTS messages/i.test(migration)) {
  console.error('messages table must not exist in v0.1');
  failed = true;
}
if (/CREATE TABLE IF NOT EXISTS client_limits/i.test(migration)) {
  console.error('client_limits table must not exist in v0.1');
  failed = true;
}
if (/CREATE TABLE IF NOT EXISTS documents/i.test(migration)) {
  console.error('documents table must not exist in the no-R2 build');
  failed = true;
}
if (/r2_buckets|DOCUMENTS|bucket_name/i.test(wrangler)) {
  console.error('R2 binding must not exist in the no-R2 build');
  failed = true;
}
if (/ACCESS_JWKS_URL|ACCESS_AUD|REQUIRE_ACCESS|DEV_INSECURE_AUTH_BYPASS/i.test(wrangler)) {
  console.error('Cloudflare Access vars must not exist in the free build');
  failed = true;
}
if (/cf-access-jwt-assertion|CF_Authorization|ACCESS_JWKS_URL|ACCESS_AUD|verifyAccessJwt/i.test(worker)) {
  console.error('Cloudflare Access code must not exist in the free build');
  failed = true;
}
if (/MASTER_TOKEN\s*=/i.test(wrangler)) {
  console.error('MASTER_TOKEN must be configured as a Wrangler secret, not a plain var');
  failed = true;
}

if (failed) process.exit(1);
console.log('project verification passed');
