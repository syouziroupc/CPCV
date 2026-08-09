#!/usr/bin/env bash
set -euo pipefail

SOURCE_COMMIT="4a295ae5505a680019b9896b97e1d6f1ec2f20cd"
STAGING_ARTIFACT_ID="9033600963"
STAGING_ARTIFACT_SHA256="be1d35639a6a1e51c7ac562310ebf15eb259941a5f6aa368d291538d47325bf7"
STAGING_DEPLOYMENT_ID="e8928684-b111-44d3-9bc7-a8d965a5bde8"
STAGING_CONFIG_SHA256="8c472af26b4073b3be9f43391b34bad564a222541d819f4fec7bfdfaaaa41864"
STAGING_RECORD_SHA256="6a18d140d2d545f0091f91840b4492324ca9529e0308ce2ab99ec4e9a806fa21"
PRODUCTION_ORIGIN="https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev"

: "${CLOUDFLARE_API_TOKEN:?missing CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?missing CLOUDFLARE_ACCOUNT_ID}"
: "${GH_TOKEN:?missing GH_TOKEN}"
: "${GITHUB_REPOSITORY:?missing GITHUB_REPOSITORY}"

test "$(git rev-parse HEAD)" = "$SOURCE_COMMIT"
test -z "$(git status --porcelain)"
mkdir -p deployment-records

log() { printf '\n== %s ==\n' "$*"; }

log "Recover and reverify canonical staging evidence"
ARTIFACT_ZIP="$RUNNER_TEMP/pr55-staging-evidence.zip"
ARTIFACT_DIR="$RUNNER_TEMP/pr55-staging-evidence"
curl --fail-with-body -sS -L \
  -H 'Accept: application/vnd.github+json' \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H 'X-GitHub-Api-Version: 2026-03-10' \
  "https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/artifacts/${STAGING_ARTIFACT_ID}/zip" \
  -o "$ARTIFACT_ZIP"
test "$(sha256sum "$ARTIFACT_ZIP" | cut -d' ' -f1)" = "$STAGING_ARTIFACT_SHA256"
rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR"
unzip -q "$ARTIFACT_ZIP" -d "$ARTIFACT_DIR"
test "$(cat "$ARTIFACT_DIR/STAGING_DEPLOYMENT_ID.txt")" = "$STAGING_DEPLOYMENT_ID"
test "$(sha256sum "$ARTIFACT_DIR/wrangler.staging.toml" | cut -d' ' -f1)" = "$STAGING_CONFIG_SHA256"
test "$(sha256sum "$ARTIFACT_DIR/staging-acceptance-record.txt" | cut -d' ' -f1)" = "$STAGING_RECORD_SHA256"
node scripts/materialize-staging-config.mjs "$ARTIFACT_DIR/wrangler.staging.toml" --expected-sha256 "$STAGING_CONFIG_SHA256"
node scripts/verify-deployment-config.mjs .cpcv-staging.wrangler.toml
node scripts/verify-environment-separation.mjs wrangler.toml .cpcv-staging.wrangler.toml
node scripts/verify-staging-evidence.mjs "$ARTIFACT_DIR/staging-acceptance-record.txt" \
  --commit "$SOURCE_COMMIT" \
  --deployment "$STAGING_DEPLOYMENT_ID" \
  --config-sha256 "$STAGING_CONFIG_SHA256"
npx wrangler deploy --dry-run --config .cpcv-staging.wrangler.toml > deployment-records/00-staging-dry-run-recheck.txt 2>&1
rm -f .cpcv-staging.wrangler.toml
test -z "$(git status --porcelain)"

log "Full immutable-source validation"
npm run verify:source-manifest
npm run check
npm run check:project
npm run check:pdf-links
npm run check:stage08
npm run test:owner-bootstrap
npm run verify:ai-ready
npm run verify:final-docs
npm run deploy:dry-run
npm audit
npm audit --omit=dev

log "Verify production Worker secret bindings exist without reading values"
npx wrangler secret list --config wrangler.toml > deployment-records/01-production-secret-names.json
node --input-type=module <<'NODE'
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('deployment-records/01-production-secret-names.json', 'utf8'));
const names = new Set(data.map((item) => String(item.name || '')));
for (const name of ['AUTH_RATE_LIMIT_PEPPER', 'PUBLIC_RATE_LIMIT_PEPPER', 'TURNSTILE_SECRET_KEY']) {
  if (!names.has(name)) throw new Error(`Missing production secret binding: ${name}`);
  console.log(`${name}=PRESENT`);
}
NODE

{
  echo "requested_commit=$SOURCE_COMMIT"
  echo "checked_out_commit=$(git rev-parse HEAD)"
  echo "staging_commit=$SOURCE_COMMIT"
  echo "staging_deployment_id=$STAGING_DEPLOYMENT_ID"
  echo "staging_test_record_sha256=$STAGING_RECORD_SHA256"
  echo "staging_config_sha256=$STAGING_CONFIG_SHA256"
  echo "failed_builtin_production_run=31298094738"
  echo "secret_strategy=preserve_existing_cloudflare_worker_secrets"
  echo "started_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "wrangler=$(npx wrangler --version | tail -n 1)"
} > deployment-records/02-metadata.txt
cp wrangler.toml deployment-records/02-wrangler-production.toml
cp "$ARTIFACT_DIR/wrangler.staging.toml" deployment-records/02-wrangler-staging-canonical.toml
cp "$ARTIFACT_DIR/staging-acceptance-record.txt" deployment-records/02-staging-acceptance-record.txt

log "Record D1 Time Travel and preflight"
npx wrangler d1 time-travel info class_comment_db_v2 2>&1 | tee deployment-records/03-d1-time-travel.txt
npm run verify:stage82-preflight 2>&1 | tee deployment-records/04-stage82-preflight.txt
npx wrangler d1 migrations list class_comment_db --remote 2>&1 | tee deployment-records/05-legacy-migrations-before.txt
npx wrangler d1 migrations list class_comment_db_v2 --remote 2>&1 | tee deployment-records/06-v2-migrations-before.txt
node scripts/verify-remote-d1.mjs 2>&1 | tee deployment-records/07-remote-d1-before-migration.txt
npm run verify:email-auth-ready 2>&1 | tee deployment-records/08-email-auth-readiness-before-migration.txt
npx wrangler deployments status 2>&1 | tee deployment-records/09-deployments-status-before.txt
npx wrangler versions list --json > deployment-records/10-versions-list-before.json
PRE_VERSION_ID="$(node --input-type=module -e "import fs from 'node:fs'; const x=JSON.parse(fs.readFileSync('deployment-records/10-versions-list-before.json','utf8')); const a=Array.isArray(x)?x:(x.items||x.versions||[]); const v=a[0]; if(!v) process.exit(2); console.log(v.id||v.version_id||v.versionId||'');")"
test -n "$PRE_VERSION_ID"
echo "$PRE_VERSION_ID" > deployment-records/PRE_VERSION_ID.txt

log "Apply production D1 migrations"
npx wrangler d1 migrations apply class_comment_db --remote 2>&1 | tee deployment-records/11-legacy-migrations-apply.txt
npx wrangler d1 migrations apply class_comment_db_v2 --remote 2>&1 | tee deployment-records/12-v2-migrations-apply.txt
node scripts/verify-remote-d1.mjs 2>&1 | tee deployment-records/13-remote-d1-after-migration.txt

log "Deploy immutable source while preserving existing encrypted secrets"
set +e
npx wrangler deploy --message "CPCV PR55 release $SOURCE_COMMIT; preserve existing Worker secrets" 2>&1 | tee deployment-records/14-worker-deploy.txt
DEPLOY_RC=${PIPESTATUS[0]}
set -e
if [ "$DEPLOY_RC" -ne 0 ]; then
  echo "deploy_failed_before_smoke=true" > deployment-records/ROLLBACK_STATUS.txt
  exit "$DEPLOY_RC"
fi

log "Verify secrets still exist after deploy"
npx wrangler secret list --config wrangler.toml > deployment-records/15-production-secret-names-after.json
node --input-type=module <<'NODE'
import fs from 'node:fs';
const data = JSON.parse(fs.readFileSync('deployment-records/15-production-secret-names-after.json', 'utf8'));
const names = new Set(data.map((item) => String(item.name || '')));
for (const name of ['AUTH_RATE_LIMIT_PEPPER', 'PUBLIC_RATE_LIMIT_PEPPER', 'TURNSTILE_SECRET_KEY']) {
  if (!names.has(name)) throw new Error(`Secret disappeared after deploy: ${name}`);
}
NODE
node scripts/verify-remote-d1.mjs 2>&1 | tee deployment-records/16-remote-d1-after-deploy.txt

log "Production smoke and static-asset verification"
set +e
node scripts/smoke-production.mjs 2>&1 | tee deployment-records/17-production-smoke.txt
SMOKE_RC=${PIPESTATUS[0]}
if [ "$SMOKE_RC" -eq 0 ]; then
  for path in / /about /guide /privacy /admin /signup /forgot-password; do
    name="$(echo "$path" | tr '/' '_' | sed 's/^_*//')"; [ -n "$name" ] || name=home
    code="$(curl -sS -L --retry 8 --retry-delay 2 --retry-all-errors --connect-timeout 10 --max-time 30 -o "deployment-records/page-${name}.html" -w '%{http_code}' "$PRODUCTION_ORIGIN$path?release=$SOURCE_COMMIT")"
    if [ "$code" -lt 200 ] || [ "$code" -ge 400 ]; then SMOKE_RC=1; break; fi
  done
fi
if [ "$SMOKE_RC" -eq 0 ]; then
  curl --fail-with-body -sS --retry 8 --retry-delay 2 --connect-timeout 10 --max-time 30 "$PRODUCTION_ORIGIN/assets/app.css?release=$SOURCE_COMMIT" > deployment-records/app.css || SMOKE_RC=1
fi
if [ "$SMOKE_RC" -eq 0 ]; then
  grep -Fq '登録済みかどうかは表示しません' deployment-records/page-forgot-password.html || SMOKE_RC=1
fi
set -e

if [ "$SMOKE_RC" -ne 0 ]; then
  log "Smoke failed; rolling Worker code back to pre-deploy version $PRE_VERSION_ID"
  npx wrangler rollback "$PRE_VERSION_ID" --message "Automatic rollback after PR55 production smoke failure" 2>&1 | tee deployment-records/18-automatic-rollback.txt || true
  npx wrangler deployments status 2>&1 | tee deployment-records/19-deployments-status-after-rollback.txt || true
  echo "rolled_back_to=$PRE_VERSION_ID" > deployment-records/ROLLBACK_STATUS.txt
  exit 1
fi

log "Record final active Worker state"
npx wrangler deployments status 2>&1 | tee deployment-records/18-deployments-status-after.txt
npx wrangler versions list --json > deployment-records/19-versions-list-after.json
POST_VERSION_ID="$(node --input-type=module -e "import fs from 'node:fs'; const x=JSON.parse(fs.readFileSync('deployment-records/19-versions-list-after.json','utf8')); const a=Array.isArray(x)?x:(x.items||x.versions||[]); const v=a[0]; if(!v) process.exit(2); console.log(v.id||v.version_id||v.versionId||'');")"
test -n "$POST_VERSION_ID"
echo "$POST_VERSION_ID" > deployment-records/PRODUCTION_VERSION_ID.txt
{
  echo "completed_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "job_status=success"
  echo "final_commit=$(git rev-parse HEAD)"
  echo "pre_version=$PRE_VERSION_ID"
  echo "production_version=$POST_VERSION_ID"
  echo "secrets_preserved=YES"
  echo "production_smoke=PASSED"
} > deployment-records/99-result.txt
find deployment-records -type f ! -name SHA256SUMS.txt -print0 | sort -z | xargs -0 sha256sum > deployment-records/SHA256SUMS.txt
printf 'Production deployment passed: commit=%s version=%s\n' "$SOURCE_COMMIT" "$POST_VERSION_ID"
