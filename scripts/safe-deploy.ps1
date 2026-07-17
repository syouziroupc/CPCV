$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

Write-Host ''
Write-Host 'Class PDF Comment Viewer - production deployment' -ForegroundColor Yellow
Write-Host 'This command validates locally, migrates both D1 databases, verifies DB_V2, configures authentication secrets, deploys, and runs smoke checks.'
Write-Host ''

$gitStatus = (& git status --porcelain | Out-String).Trim()
if (-not [string]::IsNullOrWhiteSpace($gitStatus)) {
  throw 'Working tree is not clean. Commit the reviewed release before deployment.'
}
$releaseCommit = (& git rev-parse HEAD | Out-String).Trim()
if ($releaseCommit -notmatch '^[0-9a-fA-F]{40}$') { throw 'Unable to resolve the exact release commit.' }
if ($env:CPCV_STAGING_COMMIT_SHA -ine $releaseCommit) {
  throw 'CPCV_STAGING_COMMIT_SHA must equal the exact reviewed release commit.'
}
if ($env:CPCV_STAGING_CONFIRMATION -cne 'STAGING_PASSED') {
  throw 'Set CPCV_STAGING_CONFIRMATION=STAGING_PASSED only after the full staging acceptance test passes.'
}
if ([string]::IsNullOrWhiteSpace($env:CPCV_STAGING_DEPLOYMENT_ID)) {
  throw 'Set CPCV_STAGING_DEPLOYMENT_ID from the completed staging deployment.'
}
if ($env:CPCV_STAGING_TEST_RECORD_SHA256 -notmatch '^[0-9a-fA-F]{64}$') {
  throw 'Set CPCV_STAGING_TEST_RECORD_SHA256 to the completed staging acceptance record hash.'
}

& npm run verify:deployment
if ($LASTEXITCODE -ne 0) { throw 'Production configuration is incomplete.' }
& npm run check
if ($LASTEXITCODE -ne 0) { throw 'Static checks failed.' }
& npm run check:project
if ($LASTEXITCODE -ne 0) { throw 'Project checks failed.' }
& npm run check:pdf-links
if ($LASTEXITCODE -ne 0) { throw 'PDF checks failed.' }
& npm run check:stage08
if ($LASTEXITCODE -ne 0) { throw 'Stage 8 tests failed.' }
& npm run test:owner-bootstrap
if ($LASTEXITCODE -ne 0) { throw 'Owner bootstrap regression failed.' }
& npm run verify:final-docs
if ($LASTEXITCODE -ne 0) { throw 'Final documentation validation failed.' }
& npm run verify:ai-ready
if ($LASTEXITCODE -ne 0) { throw 'AI configuration readiness failed.' }
& npm run deploy:dry-run
if ($LASTEXITCODE -ne 0) { throw 'Wrangler dry-run failed.' }
& npm audit
if ($LASTEXITCODE -ne 0) { throw 'Dependency audit failed.' }
& npm audit --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'Production dependency audit failed.' }

if ([string]::IsNullOrWhiteSpace($env:AUTH_RATE_LIMIT_PEPPER)) {
  throw 'Set AUTH_RATE_LIMIT_PEPPER in the current process before deployment.'
}
if ([string]::IsNullOrWhiteSpace($env:PUBLIC_RATE_LIMIT_PEPPER)) {
  throw 'Set PUBLIC_RATE_LIMIT_PEPPER in the current process before deployment.'
}
if ([string]::IsNullOrWhiteSpace($env:TURNSTILE_SECRET_KEY)) {
  throw 'Set TURNSTILE_SECRET_KEY in the current process before deployment.'
}

$confirmation = Read-Host 'Type DEPLOY_PRODUCTION to migrate and publish production'
if ($confirmation -cne 'DEPLOY_PRODUCTION') {
  Write-Host 'Deployment cancelled. Cloudflare was not changed.' -ForegroundColor Cyan
  exit 0
}

& npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare authentication check failed.' }
& npx wrangler d1 time-travel info class_comment_db_v2
if ($LASTEXITCODE -ne 0) { throw 'Unable to record the pre-migration D1 bookmark.' }
& npm run verify:stage82-preflight
if ($LASTEXITCODE -ne 0) { throw 'Stage 8.2 existing-data preflight failed.' }
& npx wrangler d1 migrations apply class_comment_db --remote
if ($LASTEXITCODE -ne 0) { throw 'Legacy D1 migration failed.' }
& npx wrangler d1 migrations apply class_comment_db_v2 --remote
if ($LASTEXITCODE -ne 0) { throw 'DB_V2 migration failed.' }
& node scripts/verify-remote-d1.mjs
if ($LASTEXITCODE -ne 0) { throw 'Remote DB_V2 verification failed.' }
& npm run verify:email-auth-ready
if ($LASTEXITCODE -ne 0) { throw 'Email authentication cutover readiness failed.' }
& node scripts/configure-rate-limit-secret.mjs
if ($LASTEXITCODE -ne 0) { throw 'Rate-limit pepper configuration failed.' }
& npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed.' }
& node scripts/verify-remote-d1.mjs
if ($LASTEXITCODE -ne 0) { throw 'Post-deploy remote DB_V2 verification failed.' }
& node scripts/smoke-production.mjs
if ($LASTEXITCODE -ne 0) { throw 'Production smoke checks failed.' }
& npx wrangler deployments status
if ($LASTEXITCODE -ne 0) { throw 'Unable to record deployment status.' }
& npx wrangler versions list
if ($LASTEXITCODE -ne 0) { throw 'Unable to record Worker versions.' }
