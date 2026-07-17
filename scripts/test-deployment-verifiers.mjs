import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const temp = mkdtempSync(join(tmpdir(), "cpcv-deploy-verifiers-"));
const results = [];
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
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
