#!/usr/bin/env bash
set -euo pipefail

SOURCE_COMMIT="82e96a23e103c0c826b772c576408c58ec8f9ce7"
STAGING_ORIGIN="https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev"
PRODUCTION_ORIGIN="https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev"
ROOT="$GITHUB_WORKSPACE"
WRANGLER="$ROOT/node_modules/.bin/wrangler"
LIVE_AUDIT="/tmp/cpcv-responsive-ai-ops/live-layout-audit.py"
RECORDS="$ROOT/deployment-records"
mkdir -p "$RECORDS"

{
  echo "application_commit=$SOURCE_COMMIT"
  echo "workflow_run_id=${GITHUB_RUN_ID:-}"
  echo "started_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$RECORDS/00-metadata.txt"

test "$(git rev-parse HEAD)" = "$SOURCE_COMMIT"
test -z "$(git status --porcelain)"

run_recorded() {
  local name="$1"
  shift
  "$@" 2>&1 | tee "$RECORDS/$name"
}

run_recorded 01-source-manifest.txt npm run verify:source-manifest
run_recorded 02-ai-translation-unit.txt node scripts/test-ai-translation-resilience.mjs
run_recorded 03-predeploy-check.txt npm run check
run_recorded 04-project-check.txt npm run check:project
run_recorded 05-pdf-links.txt npm run check:pdf-links
run_recorded 06-final-docs.txt npm run verify:final-docs
run_recorded 07-stage08-all.txt npm run check:stage08
run_recorded 08-owner-bootstrap.txt npm run test:owner-bootstrap
run_recorded 09-dry-run.txt npm run deploy:dry-run
run_recorded 10-audit-all.txt npm audit
run_recorded 11-audit-production.txt npm audit --omit=dev
run_recorded 12-local-layout-audit.txt python scripts/audit-responsive-layout.py
cp -R artifacts/responsive-layout-audit "$RECORDS/local-layout-evidence"
rm -rf artifacts

test "$(git rev-parse HEAD)" = "$SOURCE_COMMIT"
git diff --exit-code

python - <<'PY'
from pathlib import Path
source = Path('wrangler.toml').read_text(encoding='utf-8')
replacements = {
    'name = "class-pdf-comment-viewer-v01"': 'name = "class-pdf-comment-viewer-v01-staging"',
    'database_name = "class_comment_db"': 'database_name = "class_comment_db_staging"',
    'database_id = "f11457fa-27af-468d-94cc-6cdf1ae814e4"': 'database_id = "20e4531c-2765-46b5-a68f-940daa94d6a9"',
    'database_name = "class_comment_db_v2"': 'database_name = "class_comment_db_v2_staging"',
    'database_id = "8315a076-67ad-44e6-8286-11887af52ad3"': 'database_id = "7b30a11d-5b3c-49f5-bc54-9a1326818089"',
    'queue = "cpcv-ai-jobs"': 'queue = "cpcv-ai-jobs-staging"',
    'queue = "cpcv-ai-translation-jobs"': 'queue = "cpcv-ai-translation-jobs-staging"',
    'dead_letter_queue = "cpcv-ai-translation-dlq"': 'dead_letter_queue = "cpcv-ai-translation-dlq-staging"',
    'queue = "cpcv-ai-moderation-jobs"': 'queue = "cpcv-ai-moderation-jobs-staging"',
    'dead_letter_queue = "cpcv-ai-moderation-dlq"': 'dead_letter_queue = "cpcv-ai-moderation-dlq-staging"',
    '826071901': '826071801',
    '826071902': '826071802',
    '826071903': '826071803',
    '826071904': '826071804',
    '826071905': '826071805',
    '826071906': '826071806',
    'https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev': 'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev',
    'TURNSTILE_SITE_KEY = "0x4AAAAAAD9zOVz8FBcawf0n"': 'TURNSTILE_SITE_KEY = "1x00000000000000000000AA"',
}
for old, new in replacements.items():
    if old not in source:
        raise SystemExit(f'missing staging replacement: {old}')
    source = source.replace(old, new)
Path('.cpcv-staging.wrangler.toml').write_text(source, encoding='utf-8')
PY

run_recorded 13-staging-config-check.txt node scripts/verify-deployment-config.mjs .cpcv-staging.wrangler.toml
run_recorded 14-environment-separation.txt node scripts/verify-environment-separation.mjs --mode production-gate --production wrangler.toml --staging .cpcv-staging.wrangler.toml
sha256sum .cpcv-staging.wrangler.toml | tee "$RECORDS/15-staging-config-sha256.txt"

run_recorded 16-staging-legacy-migrations.txt "$WRANGLER" d1 migrations apply class_comment_db_staging --remote --config .cpcv-staging.wrangler.toml
run_recorded 17-staging-v2-migrations.txt "$WRANGLER" d1 migrations apply class_comment_db_v2_staging --remote --config .cpcv-staging.wrangler.toml
run_recorded 18-staging-db-health.txt node scripts/verify-remote-d1.mjs --config .cpcv-staging.wrangler.toml --database class_comment_db_v2_staging
run_recorded 19-staging-deploy.txt "$WRANGLER" deploy --config .cpcv-staging.wrangler.toml --keep-vars
run_recorded 20-staging-deployment-status.txt "$WRANGLER" deployments status --config .cpcv-staging.wrangler.toml
run_recorded 21-staging-smoke.txt node scripts/smoke-production.mjs --config .cpcv-staging.wrangler.toml --origin "$STAGING_ORIGIN"
run_recorded 22-staging-live-layout.txt python "$LIVE_AUDIT" "$STAGING_ORIGIN" "$RECORDS/staging-live-layout" "$SOURCE_COMMIT"

curl --fail-with-body -sS -H 'Cache-Control: no-cache' "$STAGING_ORIGIN/admin?release=$SOURCE_COMMIT" | grep -F '授業管理へログイン' > "$RECORDS/23-staging-admin-marker.txt"
curl --fail-with-body -sS -H 'Cache-Control: no-cache' "$STAGING_ORIGIN/assets/app.css?release=$SOURCE_COMMIT" | grep -F 'app-base.css' > "$RECORDS/24-staging-css-marker.txt"

PROBE_DIR="/tmp/cpcv-ai-probe-${GITHUB_RUN_ID:-manual}"
PROBE_NAME="cpcv-translation-probe-${GITHUB_RUN_ID:-manual}"
rm -rf "$PROBE_DIR"
mkdir -p "$PROBE_DIR/src/ai"
cp src/ai/provider.js src/ai/provider-base.js src/ai/validation.js "$PROBE_DIR/src/ai/"
cat > "$PROBE_DIR/index.mjs" <<'JS'
import { runTranslationModel } from './src/ai/provider.js';
const samples = {
  fast: { message: 'This is a translation health check.', sourceLanguage: 'en', targetLanguage: 'ja', quality: 'fast' },
  balanced: { message: 'La precisione della traduzione è scarsa.', sourceLanguage: 'other', targetLanguage: 'ja', quality: 'balanced' },
  accurate: { message: 'Bugün hava bulutlu ve yağmurlu.', sourceLanguage: 'tr', targetLanguage: 'ja', quality: 'accurate' }
};
export default {
  async fetch(request, env) {
    const key = new URL(request.url).pathname.slice(1);
    if (!samples[key]) return new Response('not found', { status: 404 });
    const started = Date.now();
    try {
      const result = await runTranslationModel(env, samples[key]);
      return Response.json({ ok: true, durationMs: Date.now() - started, key, result });
    } catch (error) {
      return Response.json({
        ok: false,
        durationMs: Date.now() - started,
        key,
        error: String(error?.message || error),
        aiCode: error?.aiCode || '',
        retryable: Boolean(error?.retryable)
      }, { status: 502 });
    }
  }
};
JS
cat > "$PROBE_DIR/wrangler.toml" <<EOF
name = "$PROBE_NAME"
main = "index.mjs"
compatibility_date = "2026-06-17"
workers_dev = true
[ai]
binding = "AI"
[vars]
AI_TRANSLATION_MODEL = "@cf/meta/m2m100-1.2b"
AI_TRANSLATION_BALANCED_MODEL = "@cf/zai-org/glm-4.7-flash"
AI_TRANSLATION_ACCURATE_MODEL = "@cf/qwen/qwen3-30b-a3b-fp8"
AI_TRANSLATION_TIMEOUT_MS = "3000"
AI_TRANSLATION_BALANCED_TIMEOUT_MS = "6000"
AI_TRANSLATION_ACCURATE_TIMEOUT_MS = "12000"
EOF
cleanup_probe() {
  (cd "$PROBE_DIR" && "$WRANGLER" delete --config wrangler.toml --force) >/dev/null 2>&1 || true
}
trap cleanup_probe EXIT
(cd "$PROBE_DIR" && "$WRANGLER" deploy --config wrangler.toml) 2>&1 | tee "$RECORDS/25-ai-probe-deploy.txt"
PROBE_ORIGIN="https://${PROBE_NAME}.syouziroupc.workers.dev"
for mode in fast balanced accurate; do
  curl --fail-with-body -sS --retry 4 --retry-delay 2 --retry-all-errors "$PROBE_ORIGIN/$mode" | tee "$RECORDS/26-ai-${mode}.json"
  node -e "const x=require('./deployment-records/26-ai-${mode}.json'); if(!x.ok || !x.result || !x.result.translatedText) process.exit(1)"
done
cleanup_probe
trap - EXIT

run_recorded 27-production-secret-names.txt "$WRANGLER" secret list
for name in AUTH_RATE_LIMIT_PEPPER PUBLIC_RATE_LIMIT_PEPPER TURNSTILE_SECRET_KEY; do
  grep -F "$name" "$RECORDS/27-production-secret-names.txt" >/dev/null
done
run_recorded 28-production-time-travel.txt "$WRANGLER" d1 time-travel info class_comment_db_v2
run_recorded 29-production-legacy-migrations-before.txt "$WRANGLER" d1 migrations list class_comment_db --remote
run_recorded 30-production-v2-migrations-before.txt "$WRANGLER" d1 migrations list class_comment_db_v2 --remote
run_recorded 31-production-db-before.txt node scripts/verify-remote-d1.mjs
run_recorded 32-production-deployments-before.txt "$WRANGLER" deployments status
run_recorded 33-production-versions-before.txt "$WRANGLER" versions list

run_recorded 34-production-legacy-migrations.txt "$WRANGLER" d1 migrations apply class_comment_db --remote
run_recorded 35-production-v2-migrations.txt "$WRANGLER" d1 migrations apply class_comment_db_v2 --remote
run_recorded 36-production-db-after-migrations.txt node scripts/verify-remote-d1.mjs

test "$(git rev-parse HEAD)" = "$SOURCE_COMMIT"
git diff --exit-code
run_recorded 37-production-deploy.txt "$WRANGLER" deploy --keep-vars
run_recorded 38-production-db-after-deploy.txt node scripts/verify-remote-d1.mjs
run_recorded 39-production-smoke.txt node scripts/smoke-production.mjs --origin "$PRODUCTION_ORIGIN"
run_recorded 40-production-live-layout.txt python "$LIVE_AUDIT" "$PRODUCTION_ORIGIN" "$RECORDS/production-live-layout" "$SOURCE_COMMIT"

curl --fail-with-body -sS -H 'Cache-Control: no-cache' "$PRODUCTION_ORIGIN/admin?release=$SOURCE_COMMIT" | grep -F '授業管理へログイン' > "$RECORDS/41-production-admin-marker.txt"
curl --fail-with-body -sS -H 'Cache-Control: no-cache' "$PRODUCTION_ORIGIN/assets/app.css?release=$SOURCE_COMMIT" | grep -F 'app-base.css' > "$RECORDS/42-production-css-marker.txt"
run_recorded 43-production-deployments-after.txt "$WRANGLER" deployments status
run_recorded 44-production-versions-after.txt "$WRANGLER" versions list

{
  echo "completed_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "result=PASSED"
} > "$RECORDS/99-result.txt"
find "$RECORDS" -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > "$RECORDS/SHA256SUMS.txt"
