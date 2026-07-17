import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const packageJson = JSON.parse(text("package.json"));
const migration = text("migrations-v2/0017_final_integrity_hardening.sql");
const persistentTriggers = [...migration.matchAll(/^CREATE TRIGGER\s+(\S+)/gm)]
  .map((match) => match[1])
  .filter((name) => !name.startsWith("trg_migration_0017_"));

check("package release is 0.8.2", packageJson.version === "0.8.2");
check("README identifies Stage 8.2", text("README.md").includes("Class PDF Comment Viewer v0.8.2") && text("README.md").includes("0017"));
check("current system identifies Stage 8.2", text("docs/current-system.md").includes("Stage 8.2") && text("docs/current-system.md").includes("0.8.2"));
check("canonical index identifies migration 0017", text("docs/final-stage08/00_INDEX.md").includes("`0001`〜`0017`") && text("docs/final-stage08/00_INDEX.md").includes("20_CODEX_DEPLOY_INSTRUCTION_FINAL.md"));
check("Stage 8.2 migration has 42 persistent triggers", persistentTriggers.length === 42, persistentTriggers.join("\n"));
const auditMatrix = text("docs/final-stage08/22_AUDIT_FIX_MATRIX.csv").trim().split(/\r?\n/);
check("audit fix matrix contains header plus 71 findings", auditMatrix.length === 72);
check("audit fix matrix marks every finding locally fixed", auditMatrix.slice(1).every((line) => line.includes("修正済み。local検証済み")));

const codex = text("docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md");
for (const phrase of [
  "UUID。namespace ID。secret。domain。resource名を推測しない",
  "migrations-v2/0001から0017を編集しない",
  "stagingを省略してproductionへdeployしない",
  "stagingで検証したcommitと異なるcommitをproductionへdeployしない",
  "PDF bytes。filename。page text。画像。注釈をCloudflareへ送る変更をしない",
  "npm run verify:stage82-preflight",
  "npx wrangler d1 time-travel info class_comment_db_v2",
  "node scripts/verify-remote-d1.mjs",
  "node scripts/verify-environment-separation.mjs",
  "node scripts/verify-staging-evidence.mjs",
  "WRANGLER_STAGING_TEMPLATE.toml",
  "npx wrangler deployments status"
]) check(`Codex instruction includes: ${phrase}`, codex.includes(phrase));

const checklist = text("docs/final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md");
check("deployment checklist requires clean exact commit", checklist.includes("exact 40-character commit") && checklist.includes("clean working tree"));
check("deployment checklist requires staging evidence", checklist.includes("acceptance record SHA-256") && checklist.includes("staging commitがrelease commitと一致") && checklist.includes("verify-staging-evidence"));
check("deployment checklist requires resource separation", checklist.includes("verify-environment-separation") && checklist.includes("resource共有"));
check("deployment checklist requires post-deploy DB verification", checklist.includes("Remote D1再検査"));

const pending = text("docs/final-stage08/17_CLOUDFLARE_PENDING_VALUES.md");
for (const phrase of ["DB_V2.database_id", "AUTH_LOGIN_IP_LIMITER.namespace_id", "AUTH_PUBLIC_EMAIL_LIMITER.namespace_id", "AUTH_EMAIL_FROM", "TURNSTILE_SITE_KEY", "allowed_sender_addresses", "staging Worker"]) {
  check(`pending values include ${phrase}`, pending.includes(phrase));
}

const workflow = text(".github/workflows/deploy-production.yml");
check("production workflow requires staging commit", workflow.includes("staging_commit_sha") && workflow.includes("STAGING_PASSED"));
check("production workflow requires staging record hash", workflow.includes("staging_test_record_sha256") && workflow.includes("[0-9a-fA-F]{64}"));
check("production workflow materializes staging evidence files", workflow.includes("staging_config_base64") && workflow.includes("staging_test_record_base64") && workflow.includes("base64 --decode"));
check("production workflow verifies staging evidence contents", workflow.includes("verify-staging-evidence.mjs") && workflow.includes("verify-environment-separation.mjs"));
check("production workflow archives staging evidence", workflow.includes("00-wrangler-staging.toml") && workflow.includes("00-staging-acceptance-record.txt"));
check("production workflow records Time Travel bookmark", workflow.includes("d1 time-travel info class_comment_db_v2"));
check("production workflow runs Stage 8.2 preflight", workflow.includes("npm run verify:stage82-preflight"));
check("production workflow reverifies DB after deploy", workflow.includes("Reverify production DB_V2 after deployment"));
check("production workflow records deployed state", workflow.includes("wrangler deployments status") && workflow.includes("wrangler versions list"));
check("production workflow allows full regression duration", workflow.includes("timeout-minutes: 120"));
check("CI allows full regression duration", text(".github/workflows/ci.yml").includes("timeout-minutes: 120"));

const safeDeploy = text("scripts/safe-deploy.ps1");
check("safe deploy requires clean tree", safeDeploy.includes("git status --porcelain"));
check("safe deploy requires staging evidence", safeDeploy.includes("CPCV_STAGING_COMMIT_SHA") && safeDeploy.includes("CPCV_STAGING_TEST_RECORD_SHA256") && safeDeploy.includes("CPCV_STAGING_CONFIRMATION"));
check("safe deploy verifies evidence files and separation", safeDeploy.includes("CPCV_STAGING_CONFIG_PATH") && safeDeploy.includes("verify-staging-evidence.mjs") && safeDeploy.includes("verify-environment-separation.mjs"));
check("safe deploy helper functions precede first invocation", safeDeploy.indexOf("function Resolve-ExternalFile") < safeDeploy.indexOf("Resolve-ExternalFile -Value") && safeDeploy.indexOf("function Invoke-RecordedNative") < safeDeploy.indexOf("Invoke-RecordedNative 'Staging evidence verification'"));
check("safe deploy records SHA-256 manifest", safeDeploy.includes("SHA256SUMS.txt") && safeDeploy.includes("Get-FileHash"));
check("safe deploy runs final documentation validation", safeDeploy.includes("npm run verify:final-docs"));
check("safe deploy runs Stage 8.2 preflight", safeDeploy.includes("npm run verify:stage82-preflight"));
check("safe deploy records deployed state", safeDeploy.includes("wrangler deployments status") && safeDeploy.includes("wrangler versions list"));

const stagingTemplate = text("docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.toml");
check("staging config template is external-value only", stagingTemplate.includes("<STAGING_DB_V2_UUID>") && stagingTemplate.includes("<STAGING_RATE_NAMESPACE_4>") && !/AUTH_RATE_LIMIT_PEPPER\s*=/.test(stagingTemplate));
const stagingRecordTemplate = text("docs/final-stage08/templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt");
check("staging evidence template has fail-closed fields", stagingRecordTemplate.includes("record_format=CPCV_STAGING_ACCEPTANCE_V1") && stagingRecordTemplate.includes("acceptance_items_failed=0") && stagingRecordTemplate.includes("production_resources_used=NO") && stagingRecordTemplate.includes("pdf_data_egress=NONE"));

for (const legacy of ["docs/stage-08-codex-cloudflare-deployment.md", "docs/stage-08-precision-cloudflare-deployment.md"]) {
  const value = text(legacy);
  check(`${legacy} is deprecated`, value.includes("Deprecated deployment instruction") && value.includes("20_CODEX_DEPLOY_INSTRUCTION_FINAL.md"));
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nFinal documentation summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;

function text(path) { return readFileSync(resolve(ROOT, path), "utf8"); }
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
