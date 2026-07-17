$ErrorActionPreference = 'Stop'

function Invoke-RecordedNative {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][string]$FileName,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )
  Write-Host "[$Label]" -ForegroundColor Yellow
  $output = & $Command 2>&1
  $exitCode = $LASTEXITCODE
  $output | Tee-Object -FilePath (Join-Path $recordRoot $FileName)
  if ($exitCode -ne 0) { throw "$Label failed with exit code $exitCode." }
}

function Resolve-ExternalFile {
  param(
    [string]$Value,
    [string]$Label
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { throw "Set $Label to an external evidence file." }
  $path = if ([System.IO.Path]::IsPathRooted($Value)) {
    [System.IO.Path]::GetFullPath($Value)
  } else {
    [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Value))
  }
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "$Label does not identify an existing file." }
  $projectPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if ($path.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must remain outside the source working tree."
  }
  return $path
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot

Write-Host ''
Write-Host 'Class PDF Comment Viewer - production deployment' -ForegroundColor Yellow
Write-Host 'This command validates the exact staged commit, records evidence, migrates both D1 databases, verifies DB_V2, configures secrets, deploys, and runs smoke checks.'
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
if ($env:CPCV_STAGING_CONFIG_SHA256 -notmatch '^[0-9a-fA-F]{64}$') {
  throw 'Set CPCV_STAGING_CONFIG_SHA256 to the validated external staging Wrangler config hash.'
}

$stagingConfigPath = Resolve-ExternalFile -Value $env:CPCV_STAGING_CONFIG_PATH -Label 'CPCV_STAGING_CONFIG_PATH'
$stagingRecordPath = Resolve-ExternalFile -Value $env:CPCV_STAGING_TEST_RECORD_PATH -Label 'CPCV_STAGING_TEST_RECORD_PATH'
$stagingConfigHash = (Get-FileHash -LiteralPath $stagingConfigPath -Algorithm SHA256).Hash
$stagingRecordHash = (Get-FileHash -LiteralPath $stagingRecordPath -Algorithm SHA256).Hash
if ($stagingConfigHash -ine $env:CPCV_STAGING_CONFIG_SHA256) {
  throw 'The staging Wrangler config does not match CPCV_STAGING_CONFIG_SHA256.'
}
if ($stagingRecordHash -ine $env:CPCV_STAGING_TEST_RECORD_SHA256) {
  throw 'The staging acceptance record does not match CPCV_STAGING_TEST_RECORD_SHA256.'
}

$recordBase = if ([string]::IsNullOrWhiteSpace($env:CPCV_DEPLOYMENT_RECORDS_DIR)) {
  Join-Path $projectRoot 'deployment-records'
} elseif ([System.IO.Path]::IsPathRooted($env:CPCV_DEPLOYMENT_RECORDS_DIR)) {
  [System.IO.Path]::GetFullPath($env:CPCV_DEPLOYMENT_RECORDS_DIR)
} else {
  [System.IO.Path]::GetFullPath((Join-Path $projectRoot $env:CPCV_DEPLOYMENT_RECORDS_DIR))
}
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$recordRoot = Join-Path $recordBase "production-$timestamp"
New-Item -ItemType Directory -Path $recordRoot -Force | Out-Null
Copy-Item -LiteralPath $stagingConfigPath -Destination (Join-Path $recordRoot '00-wrangler-staging.toml')
Copy-Item -LiteralPath $stagingRecordPath -Destination (Join-Path $recordRoot '00-staging-acceptance-record.txt')
Copy-Item -LiteralPath (Join-Path $projectRoot 'wrangler.toml') -Destination (Join-Path $recordRoot '00-wrangler-production.toml')
@(
  "release_commit=$releaseCommit"
  "staging_commit=$($env:CPCV_STAGING_COMMIT_SHA)"
  "staging_deployment_id=$($env:CPCV_STAGING_DEPLOYMENT_ID)"
  "staging_test_record_sha256=$stagingRecordHash"
  "staging_config_sha256=$stagingConfigHash"
  "started_at_utc=$((Get-Date).ToUniversalTime().ToString('o'))"
  "node=$((& node --version | Out-String).Trim())"
  "npm=$((& npm --version | Out-String).Trim())"
  "wrangler=$((& npx wrangler --version | Out-String).Trim())"
) | Set-Content -LiteralPath (Join-Path $recordRoot '00-metadata.txt') -Encoding utf8

$deploymentResult = 'FAILED'
try {
  Invoke-RecordedNative 'Staging evidence verification' '00-verify-staging-evidence.txt' { & node scripts/verify-staging-evidence.mjs $stagingRecordPath --commit $releaseCommit --deployment $env:CPCV_STAGING_DEPLOYMENT_ID --config-sha256 $stagingConfigHash }
  Invoke-RecordedNative 'Production configuration verification' '01-verify-production-config.txt' { & npm run verify:deployment }
  Invoke-RecordedNative 'Staging configuration verification' '02-verify-staging-config.txt' { & node scripts/verify-deployment-config.mjs $stagingConfigPath }
  Invoke-RecordedNative 'Production and staging separation verification' '03-verify-environment-separation.txt' { & node scripts/verify-environment-separation.mjs wrangler.toml $stagingConfigPath }
  Invoke-RecordedNative 'Static checks' '04-static-check.txt' { & npm run check }
  Invoke-RecordedNative 'Project checks' '05-project-check.txt' { & npm run check:project }
  Invoke-RecordedNative 'PDF checks' '06-pdf-check.txt' { & npm run check:pdf-links }
  Invoke-RecordedNative 'Stage 8 full regression' '07-stage08-regression.txt' { & npm run check:stage08 }
  Invoke-RecordedNative 'Owner bootstrap regression' '08-owner-bootstrap.txt' { & npm run test:owner-bootstrap }
  Invoke-RecordedNative 'Final documentation validation' '09-final-documentation.txt' { & npm run verify:final-docs }
  Invoke-RecordedNative 'Production AI readiness' '10-production-ai-readiness.txt' { & npm run verify:ai-ready }
  Invoke-RecordedNative 'Staging AI readiness' '11-staging-ai-readiness.txt' { & node scripts/verify-ai-readiness.mjs --config $stagingConfigPath }
  Invoke-RecordedNative 'Production Wrangler dry-run' '12-production-dry-run.txt' { & npm run deploy:dry-run }
  Invoke-RecordedNative 'Staging Wrangler dry-run' '13-staging-dry-run.txt' { & npx wrangler deploy --dry-run --config $stagingConfigPath }
  Invoke-RecordedNative 'Dependency audit' '14-npm-audit.txt' { & npm audit }
  Invoke-RecordedNative 'Production dependency audit' '15-npm-audit-production.txt' { & npm audit --omit=dev }

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
    $deploymentResult = 'CANCELLED'
    Write-Host 'Deployment cancelled. Cloudflare was not changed.' -ForegroundColor Cyan
  } else {
    Invoke-RecordedNative 'Cloudflare authentication check' '20-wrangler-whoami.txt' { & npx wrangler whoami }
    Invoke-RecordedNative 'Pre-migration D1 bookmark' '21-d1-time-travel.txt' { & npx wrangler d1 time-travel info class_comment_db_v2 }
    Invoke-RecordedNative 'Stage 8.2 existing-data preflight' '22-stage82-preflight.txt' { & npm run verify:stage82-preflight }
    Invoke-RecordedNative 'Legacy migration list before apply' '23-legacy-migrations-before.txt' { & npx wrangler d1 migrations list class_comment_db --remote }
    Invoke-RecordedNative 'DB_V2 migration list before apply' '24-v2-migrations-before.txt' { & npx wrangler d1 migrations list class_comment_db_v2 --remote }
    Invoke-RecordedNative 'Legacy D1 migration' '25-legacy-migrations-apply.txt' { & npx wrangler d1 migrations apply class_comment_db --remote }
    Invoke-RecordedNative 'DB_V2 migration' '26-v2-migrations-apply.txt' { & npx wrangler d1 migrations apply class_comment_db_v2 --remote }
    Invoke-RecordedNative 'Remote DB_V2 verification before deploy' '27-remote-d1-before-deploy.txt' { & node scripts/verify-remote-d1.mjs }
    Invoke-RecordedNative 'Email authentication cutover readiness' '28-email-auth-readiness.txt' { & npm run verify:email-auth-ready }
    Invoke-RecordedNative 'Authentication secret configuration' '29-secret-configuration.txt' { & node scripts/configure-rate-limit-secret.mjs }
    Invoke-RecordedNative 'Worker deployment' '30-worker-deploy.txt' { & npx wrangler deploy }
    Invoke-RecordedNative 'Remote DB_V2 verification after deploy' '31-remote-d1-after-deploy.txt' { & node scripts/verify-remote-d1.mjs }
    Invoke-RecordedNative 'Production smoke checks' '32-production-smoke.txt' { & node scripts/smoke-production.mjs }
    Invoke-RecordedNative 'Worker deployment status' '33-deployments-status.txt' { & npx wrangler deployments status }
    Invoke-RecordedNative 'Worker version list' '34-versions-list.txt' { & npx wrangler versions list }
    $deploymentResult = 'PASSED'
  }
} finally {
  @(
    "result=$deploymentResult"
    "completed_at_utc=$((Get-Date).ToUniversalTime().ToString('o'))"
    "release_commit=$releaseCommit"
  ) | Set-Content -LiteralPath (Join-Path $recordRoot '99-result.txt') -Encoding utf8
  $manifestPath = Join-Path $recordRoot 'SHA256SUMS.txt'
  Get-ChildItem -LiteralPath $recordRoot -Recurse -File |
    Where-Object { $_.FullName -ne $manifestPath } |
    Sort-Object FullName |
    ForEach-Object {
      $relative = [System.IO.Path]::GetRelativePath($recordRoot, $_.FullName).Replace('\', '/')
      $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      "$hash  $relative"
    } | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Host "Deployment records: $recordRoot" -ForegroundColor Cyan
}
