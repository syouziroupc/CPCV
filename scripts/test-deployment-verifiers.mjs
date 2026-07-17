import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), "cpcv-deploy-verifiers-"));
const results = [];
const acceptanceSpecText = readFileSync(resolve(ROOT, "docs/final-stage08/10_STAGING_ACCEPTANCE_TEST.md"), "utf8");
const acceptanceSpecSha = createHash("sha256").update(Buffer.from(acceptanceSpecText, "utf8")).digest("hex");
const acceptanceItemCount = acceptanceSpecText.split(/\r?\n/).filter((line) => /^- /.test(line)).length;
try {
  const current = readFileSync(resolve(ROOT, "wrangler.toml"), "utf8");
  const validConfig = current
    .replace('name = \"EMAIL\"', 'name = \"EMAIL\"\nallowed_sender_addresses = [ \"noreply@auth.real-domain.jp\" ]')
    .replace('database_name = "class_comment_db_v2"\nmigrations_dir', 'database_name = "class_comment_db_v2"\ndatabase_id = "123e4567-e89b-42d3-a456-426614174000"\nmigrations_dir')
    .replace('PUBLIC_ORIGIN = "https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev"', 'PUBLIC_ORIGIN = "https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev"\nAUTH_EMAIL_FROM = "noreply@auth.real-domain.jp"\nAUTH_EMAIL_REPLY_TO = "support@auth.real-domain.jp"\nTURNSTILE_SITE_KEY = "0x4AAAAA-real-site-key"')
    + `\n[[ratelimits]]\nname = "AUTH_LOGIN_IP_LIMITER"\nnamespace_id = "1001"\n[ratelimits.simple]\nlimit = 20\nperiod = 60\n\n[[ratelimits]]\nname = "AUTH_LOGIN_ACCOUNT_LIMITER"\nnamespace_id = "1002"\n[ratelimits.simple]\nlimit = 10\nperiod = 60\n\n[[ratelimits]]\nname = "PUBLIC_COMMENT_RATE_LIMITER"\nnamespace_id = "1003"\n[ratelimits.simple]\nlimit = 30\nperiod = 60\n\n[[ratelimits]]\nname = "AUTH_PUBLIC_EMAIL_LIMITER"\nnamespace_id = "1004"\n[ratelimits.simple]\nlimit = 30\nperiod = 60\n`;
  const incompletePath = join(temp, "incomplete.toml");
  writeFileSync(incompletePath, current);
  const incomplete = run("scripts/verify-deployment-config.mjs", [incompletePath]);
  check("incomplete remote deployment configuration is rejected", incomplete.status === 1 && incomplete.stderr.includes("DB_V2 requires its real remote UUID") && incomplete.stderr.includes("AUTH_LOGIN_IP_LIMITER binding is missing"), incomplete);

  const validPath = join(temp, "valid.toml");
  writeFileSync(validPath, validConfig);
  const valid = run("scripts/verify-deployment-config.mjs", [validPath]);
  check("complete deployment configuration is accepted", valid.status === 0 && valid.stdout.includes("verified"), valid);

  const unrestrictedEmailPath = join(temp, "unrestricted-email.toml");
  writeFileSync(unrestrictedEmailPath, validConfig.replace('allowed_sender_addresses = [ "noreply@auth.real-domain.jp" ]\n', ""));
  const unrestrictedEmail = run("scripts/verify-deployment-config.mjs", [unrestrictedEmailPath]);
  check("unrestricted Email sender binding is rejected", unrestrictedEmail.status === 1 && unrestrictedEmail.stderr.includes("allowed_sender_addresses"), unrestrictedEmail);

  const invalidOriginPath = join(temp, "invalid-origin.toml");
  writeFileSync(invalidOriginPath, validConfig.replace('AUTH_ORIGIN = "https://', 'AUTH_ORIGIN = "http://'));
  const invalidOrigin = run("scripts/verify-deployment-config.mjs", [invalidOriginPath]);
  check("non-HTTPS production origin is rejected", invalidOrigin.status === 1 && invalidOrigin.stderr.includes("AUTH_ORIGIN"), invalidOrigin);

  const duplicateLimiterPath = join(temp, "duplicate-limiter.toml");
  writeFileSync(duplicateLimiterPath, validConfig.replace('namespace_id = "1002"', 'namespace_id = "1001"'));
  const duplicateLimiter = run("scripts/verify-deployment-config.mjs", [duplicateLimiterPath]);
  check("duplicate Rate Limiting namespaces are rejected", duplicateLimiter.status === 1 && duplicateLimiter.stderr.includes("different namespace_id"), duplicateLimiter);

  const stagingConfig = validConfig
    .replace(/^name = "class-pdf-comment-viewer-v01"$/m, 'name = "class-pdf-comment-viewer-v01-staging"')
    .replace('database_name = "class_comment_db"\ndatabase_id = "f11457fa-27af-468d-94cc-6cdf1ae814e4"', 'database_name = "class_comment_db_staging"\ndatabase_id = "223e4567-e89b-42d3-a456-426614174001"')
    .replace('database_name = "class_comment_db_v2"\ndatabase_id = "123e4567-e89b-42d3-a456-426614174000"', 'database_name = "class_comment_db_v2_staging"\ndatabase_id = "323e4567-e89b-42d3-a456-426614174002"')
    .replaceAll('queue = "cpcv-ai-jobs"', 'queue = "cpcv-ai-jobs-staging"')
    .replaceAll('https://class-pdf-comment-viewer-v01.syouziroupc.workers.dev', 'https://class-pdf-comment-viewer-v01-staging.syouziroupc.workers.dev')
    .replace('TURNSTILE_SITE_KEY = "0x4AAAAA-real-site-key"', 'TURNSTILE_SITE_KEY = "0x4AAAAA-staging-site-key"')
    .replace('namespace_id = "1001"', 'namespace_id = "2001"')
    .replace('namespace_id = "1002"', 'namespace_id = "2002"')
    .replace('namespace_id = "1003"', 'namespace_id = "2003"')
    .replace('namespace_id = "1004"', 'namespace_id = "2004"');
  const stagingPath = join(temp, "staging.toml");
  writeFileSync(stagingPath, stagingConfig);
  const runtimeStagingPath = resolve(ROOT, ".cpcv-staging.wrangler.toml");
  rmSync(runtimeStagingPath, { force: true });
  const materialized = run("scripts/materialize-staging-config.mjs", [stagingPath, "--expected-sha256", createHash("sha256").update(stagingConfig).digest("hex")]);
  check("external staging config is materialized byte-for-byte at source root", materialized.status === 0 && readFileSync(runtimeStagingPath).equals(Buffer.from(stagingConfig)), materialized);
  const stagingDryRun = runNpx(["wrangler", "deploy", "--dry-run", "--config", runtimeStagingPath]);
  check("materialized staging config resolves source-relative Wrangler paths", stagingDryRun.status === 0, stagingDryRun);
  rmSync(runtimeStagingPath, { force: true });
  const separated = run("scripts/verify-environment-separation.mjs", [validPath, stagingPath]);
  check("separate production and staging resources are accepted", separated.status === 0 && separated.stdout.includes("separation verified"), separated);

  const sharedDbPath = join(temp, "shared-db.toml");
  writeFileSync(sharedDbPath, stagingConfig.replace('database_id = "323e4567-e89b-42d3-a456-426614174002"', 'database_id = "123e4567-e89b-42d3-a456-426614174000"'));
  const sharedDb = run("scripts/verify-environment-separation.mjs", [validPath, sharedDbPath]);
  check("shared production and staging D1 is rejected", sharedDb.status === 1 && sharedDb.stderr.includes("DB_V2 database_id"), sharedDb);

  const sharedRatePath = join(temp, "shared-rate.toml");
  writeFileSync(sharedRatePath, stagingConfig.replace('namespace_id = "2001"', 'namespace_id = "1001"'));
  const sharedRate = run("scripts/verify-environment-separation.mjs", [validPath, sharedRatePath]);
  check("shared production and staging Rate Limiting namespace is rejected", sharedRate.status === 1 && sharedRate.stderr.includes("share Rate Limiting namespace_id"), sharedRate);

  const aiTarget = run("scripts/verify-ai-readiness.mjs", ["--config", validPath]);
  check("AI readiness accepts an explicit Wrangler config", aiTarget.status === 0, aiTarget);
  const stagingAiTarget = run("scripts/verify-ai-readiness.mjs", ["--config", stagingPath]);
  check("AI readiness accepts a separated staging queue", stagingAiTarget.status === 0 && stagingAiTarget.stdout.includes("cpcv-ai-jobs-staging"), stagingAiTarget);
  const emailTarget = run("scripts/verify-email-auth-readiness.mjs", ["--database", "class_comment_db_v2_staging", "--config", stagingPath]);
  check("email readiness accepts explicit staging database and config", emailTarget.status === 0 && emailTarget.stdout.includes("EMAIL_AUTH_REQUIRED=0"), emailTarget);
  const invalidTarget = run("scripts/verify-remote-d1.mjs", ["--unknown"]);
  check("remote verifier rejects unknown target options before network access", invalidTarget.status === 2 && invalidTarget.stderr.includes("Unknown deployment option"), invalidTarget);
  const invalidPreflightTarget = run("scripts/verify-stage82-preflight.mjs", ["--database", "bad database"]);
  check("Stage 8.2 preflight rejects unsafe database names before network access", invalidPreflightTarget.status === 2 && invalidPreflightTarget.stderr.includes("unsupported characters"), invalidPreflightTarget);

  const releaseCommit = "0123456789abcdef0123456789abcdef01234567";
  const deploymentId = "staging-version-20260717";
  const stagingConfigSha = createHash("sha256").update(stagingConfig).digest("hex");
  const stagingRecord = `record_format=CPCV_STAGING_ACCEPTANCE_V1\nresult=PASSED\nrelease_commit=${releaseCommit}\nstaging_deployment_id=${deploymentId}\nstaging_config_sha256=${stagingConfigSha}\nacceptance_spec_sha256=${acceptanceSpecSha}\nacceptance_items_total=${acceptanceItemCount}\nacceptance_items_failed=0\nproduction_resources_used=NO\ntest_data_cleanup=COMPLETED\npdf_data_egress=NONE\nexecuted_by=test-runner\ncompleted_at_utc=2026-07-17T06:00:00Z\n`;
  const stagingRecordPath = join(temp, "staging-acceptance.txt");
  writeFileSync(stagingRecordPath, stagingRecord);
  const stagingEvidence = run("scripts/verify-staging-evidence.mjs", [stagingRecordPath, "--commit", releaseCommit, "--deployment", deploymentId, "--config-sha256", stagingConfigSha]);
  check("complete staging acceptance evidence is accepted", stagingEvidence.status === 0 && stagingEvidence.stdout.includes("evidence verified"), stagingEvidence);
  const failedStagingRecordPath = join(temp, "staging-acceptance-failed.txt");
  writeFileSync(failedStagingRecordPath, stagingRecord.replace("acceptance_items_failed=0", "acceptance_items_failed=1"));
  const failedStagingEvidence = run("scripts/verify-staging-evidence.mjs", [failedStagingRecordPath, "--commit", releaseCommit, "--deployment", deploymentId, "--config-sha256", stagingConfigSha]);
  check("failed staging acceptance evidence is rejected", failedStagingEvidence.status === 1 && failedStagingEvidence.stderr.includes("acceptance_items_failed"), failedStagingEvidence);
  const shortStagingRecordPath = join(temp, "staging-acceptance-short.txt");
  writeFileSync(shortStagingRecordPath, stagingRecord.replace(`acceptance_items_total=${acceptanceItemCount}`, "acceptance_items_total=1"));
  const shortStagingEvidence = run("scripts/verify-staging-evidence.mjs", [shortStagingRecordPath, "--commit", releaseCommit, "--deployment", deploymentId, "--config-sha256", stagingConfigSha]);
  check("incomplete staging acceptance item count is rejected", shortStagingEvidence.status === 1 && shortStagingEvidence.stderr.includes("acceptance_items_total"), shortStagingEvidence);
  const staleSpecRecordPath = join(temp, "staging-acceptance-stale-spec.txt");
  writeFileSync(staleSpecRecordPath, stagingRecord.replace(acceptanceSpecSha, "0".repeat(64)));
  const staleSpecEvidence = run("scripts/verify-staging-evidence.mjs", [staleSpecRecordPath, "--commit", releaseCommit, "--deployment", deploymentId, "--config-sha256", stagingConfigSha]);
  check("stale staging acceptance specification hash is rejected", staleSpecEvidence.status === 1 && staleSpecEvidence.stderr.includes("acceptance_spec_sha256"), staleSpecEvidence);

  const fixtures = {
    owner: [{ success: true, results: [{ active_owner_count: 1 }] }],
    noOwner: [{ success: true, results: [{ active_owner_count: 0 }] }],
    noRows: [{ success: true, results: [] }],
    badRows: [{ success: true, results: [{ table: "comments" }] }],
    quick: [{ success: true, results: [{ quick_check: "ok" }] }],
    badQuick: [{ success: true, results: [{ quick_check: "corrupt" }] }]
  };
  for (const [name, value] of Object.entries(fixtures)) writeFileSync(join(temp, `${name}.json`), JSON.stringify(value));
  check("active Owner result verifier accepts a positive count", run("scripts/verify-d1-query-result.mjs", [join(temp, "owner.json"), "active-owner"]).status === 0);
  check("active Owner result verifier rejects zero", run("scripts/verify-d1-query-result.mjs", [join(temp, "noOwner.json"), "active-owner"]).status === 1);
  check("foreign-key result verifier accepts no rows", run("scripts/verify-d1-query-result.mjs", [join(temp, "noRows.json"), "no-rows"]).status === 0);
  check("foreign-key result verifier rejects rows", run("scripts/verify-d1-query-result.mjs", [join(temp, "badRows.json"), "no-rows"]).status === 1);
  check("quick-check verifier accepts ok", run("scripts/verify-d1-query-result.mjs", [join(temp, "quick.json"), "quick-check"]).status === 0);
  check("quick-check verifier rejects corruption", run("scripts/verify-d1-query-result.mjs", [join(temp, "badQuick.json"), "quick-check"]).status === 1);

  const origin = run("scripts/print-production-origin.mjs");
  check("production origin helper returns HTTPS URL", origin.status === 0 && /^https:\/\//.test(origin.stdout.trim()), origin);
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nDeployment verifier test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;

function run(script, args = []) {
  return spawnSync(process.execPath, [resolve(ROOT, script), ...args], { encoding: "utf8", cwd: ROOT });
}
function runNpx(args = []) {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  return spawnSync(command, args, { encoding: "utf8", cwd: ROOT });
}
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
