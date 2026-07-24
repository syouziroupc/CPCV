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

check("package release is 0.8.10", packageJson.version === "0.8.10");
check("README identifies v0.8.10 and Stage 8.2 schema", text("README.md").includes("Class PDF Comment Viewer v0.8.10") && text("README.md").includes("0017"));
check("README requires bundle clone", text("README.md").includes("CPCV_stage08_2_history.bundle") && text("README.md").includes("source/expanded-source"));
check("README documents staging materialization", text("README.md").includes("materialize-staging-config") && text("README.md").includes("44項目"));
check("current system identifies v0.8.10 on Stage 8.2 schema", text("docs/current-system.md").includes("Stage 8.2") && text("docs/current-system.md").includes("0.8.10"));
check("v0.8.10 debug release documentation exists", text("docs/v0.8.10-debug-fixes.md").includes("delivery-only") && text("docs/v0.8.10-debug-fixes.md").includes("モバイル"));
check("canonical index identifies migration 0017", text("docs/final-stage08/00_INDEX.md").includes("`0001`〜`0017`") && text("docs/final-stage08/00_INDEX.md").includes("20_CODEX_DEPLOY_INSTRUCTION_FINAL.md"));
check("Stage 8.2 migration has 42 persistent triggers", persistentTriggers.length === 42, persistentTriggers.join("\n"));
const auditMatrix = text("docs/final-stage08/22_AUDIT_FIX_MATRIX.csv").trim().split(/\r?\n/);
check("audit fix matrix contains header plus 71 findings", auditMatrix.length === 72);
check("audit fix matrix marks every finding locally fixed", auditMatrix.slice(1).every((line) => line.includes("修正済み。local検証済み")));

const codex = text("docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md");
for (const phrase of [
  "UUID。namespace ID。secret。domain。resource名を推測しない",
  "companion `.zip.sha256`がない状態で開始しない",
  "source/expanded-sourceをGit作業treeとして使わない",
  "git/CPCV_stage08_2_history.bundle",
  "source/expanded-source/docs/final-stage08/20_CODEX_DEPLOY_INSTRUCTION_FINAL.md",
  "npm run manifest:source",
  "npm run verify:source-manifest",
  "materialize-staging-config.mjs",
  ".cpcv-staging.wrangler.toml",
  "10_STAGING_ACCEPTANCE_TEST.mdの44項目",
  "staging acceptance spec SHA-256",
  "npm run verify:stage82-preflight",
  "npx wrangler d1 time-travel info class_comment_db_v2",
  "npx wrangler d1 migrations list class_comment_db_v2 --remote",
  "npx wrangler deployments status",
  "npx wrangler versions list",
  "npx wrangler rollback <EXACT_PREVIOUS_VERSION_ID>",
  "production environmentへrequired reviewer"
]) check(`Codex instruction includes: ${phrase}`, codex.includes(phrase));
check("Codex instruction removed invalid source/docs paths", !/^\d+\. source\/docs\/final-stage08\//m.test(codex));
check("Codex requires release commit after production config", codex.indexOf("production configとrelease commit") < codex.indexOf("localで作業clone root"));

const runbook = text("docs/final-stage08/09_CODEX_CLOUDFLARE_RUNBOOK.md");
check("runbook requires outer companion hash", runbook.includes(".zip.sha256") && runbook.includes("sha256sum -c"));
check("runbook clones Git bundle", runbook.includes("git clone git/CPCV_stage08_2_history.bundle") && runbook.includes("source/expanded-source"));
check("runbook creates a deployment release commit", runbook.includes("npm run manifest:source") && runbook.includes("Configure verified production deployment resources"));
check("runbook materializes staging config at source root", runbook.includes(".cpcv-staging.wrangler.toml") && runbook.includes("materialize-staging-config.mjs"));
check("runbook requires Actions commit push", runbook.includes("pushされていないbundle内commit") && runbook.includes("remote repository"));
check("runbook records read-only rollback state before approval", runbook.includes("production前のread-only停止点") && runbook.includes("versions list"));
check("runbook documents exact rollback command", runbook.includes("wrangler rollback <EXACT_PREVIOUS_VERSION_ID>"));

const checklist = text("docs/final-stage08/19_DEPLOYMENT_FINAL_CHECKLIST.md");
check("deployment checklist requires clean exact commit", checklist.includes("exact 40-character release commit") && checklist.includes("clean working tree"));
check("deployment checklist requires source manifest generation", checklist.includes("npm run manifest:source") && checklist.includes("npm run verify:source-manifest"));
check("deployment checklist requires 44 staging items and spec hash", checklist.includes("acceptance test 44件成功") && checklist.includes("acceptance spec SHA-256"));
check("deployment checklist requires resource separation", checklist.includes("verify-environment-separation") && checklist.includes("resource共有なし"));
check("deployment checklist requires read-only rollback evidence before approval", checklist.indexOf("rollback先exact Worker version ID確定") < checklist.indexOf("明示承認"));
check("deployment checklist requires post-deploy DB verification", checklist.includes("Remote D1再検査"));

const acceptance = text("docs/final-stage08/10_STAGING_ACCEPTANCE_TEST.md");
const acceptanceItems = acceptance.split(/\r?\n/).filter((line) => /^- /.test(line)).length;
check("staging acceptance specification has exactly 44 items", acceptanceItems === 44, String(acceptanceItems));
check("staging acceptance uses materialized config", acceptance.includes("materialize-staging-config.mjs") && acceptance.includes(".cpcv-staging.wrangler.toml"));
check("staging acceptance records specification hash", acceptance.includes("sha256sum docs/final-stage08/10_STAGING_ACCEPTANCE_TEST.md"));

const pending = text("docs/final-stage08/17_CLOUDFLARE_PENDING_VALUES.md");
for (const phrase of ["DB_V2.database_id", "AUTH_LOGIN_IP_LIMITER.namespace_id", "AUTH_PUBLIC_EMAIL_LIMITER.namespace_id", "AUTH_EMAIL_FROM", "TURNSTILE_SITE_KEY", "allowed_sender_addresses", "staging Worker", "required reviewer", "materialize-staging-config.mjs"]) {
  check(`pending values include ${phrase}`, pending.includes(phrase));
}

const workflow = text(".github/workflows/deploy-production.yml");
check("production workflow requires staging commit", workflow.includes("staging_commit_sha") && workflow.includes("STAGING_PASSED"));
check("production workflow requires staging record hash", workflow.includes("staging_test_record_sha256") && workflow.includes("[0-9a-fA-F]{64}"));
check("production workflow materializes external staging evidence", workflow.includes("$RUNNER_TEMP/cpcv-wrangler.staging.toml") && workflow.includes("materialize-staging-config.mjs"));
check("production workflow dry-runs materialized staging config", workflow.includes("wrangler deploy --dry-run --config .cpcv-staging.wrangler.toml"));
check("production workflow removes runtime staging config", workflow.includes("rm -f .cpcv-staging.wrangler.toml"));
check("production workflow verifies source manifest", workflow.includes("npm run verify:source-manifest"));
check("production workflow verifies staging evidence contents", workflow.includes("verify-staging-evidence.mjs") && workflow.includes("verify-environment-separation.mjs"));
check("production workflow archives canonical staging evidence", workflow.includes("00-wrangler-staging-canonical.toml") && workflow.includes("00-staging-acceptance-record.txt"));
check("production workflow records Time Travel bookmark", workflow.includes("d1 time-travel info class_comment_db_v2"));
check("production workflow runs Stage 8.2 preflight", workflow.includes("npm run verify:stage82-preflight"));
check("production workflow records Worker state before migrations", workflow.indexOf("Record pre-deploy Worker rollback state") < workflow.indexOf("Apply legacy D1 migrations"));
check("production workflow reverifies DB after deploy", workflow.includes("Reverify production DB_V2 after deployment"));
check("production workflow records post-deploy state", workflow.includes("deployments-status-after") && workflow.includes("versions-list-after"));
check("production workflow allows full regression duration", workflow.includes("timeout-minutes: 120"));

const ci = text(".github/workflows/ci.yml");
check("CI allows full regression duration", ci.includes("timeout-minutes: 120"));
check("CI verifies source manifest", ci.includes("npm run verify:source-manifest"));
check("CI validates final documentation", ci.includes("npm run verify:final-docs"));
check("CI audits production dependencies", ci.includes("npm audit --omit=dev"));

const safeDeploy = text("scripts/safe-deploy.ps1");
check("safe deploy requires clean tree", safeDeploy.includes("git status --porcelain"));
check("safe deploy requires staging evidence", safeDeploy.includes("CPCV_STAGING_COMMIT_SHA") && safeDeploy.includes("CPCV_STAGING_TEST_RECORD_SHA256") && safeDeploy.includes("CPCV_STAGING_CONFIRMATION"));
check("safe deploy materializes source-root staging config", safeDeploy.includes("materialize-staging-config.mjs") && safeDeploy.includes(".cpcv-staging.wrangler.toml"));
check("safe deploy verifies source manifest", safeDeploy.includes("npm run verify:source-manifest"));
check("safe deploy verifies evidence files and separation", safeDeploy.includes("verify-staging-evidence.mjs") && safeDeploy.includes("verify-environment-separation.mjs"));
check("safe deploy helper functions precede first invocation", safeDeploy.indexOf("function Resolve-ExternalFile") < safeDeploy.indexOf("Resolve-ExternalFile -Value") && safeDeploy.indexOf("function Invoke-RecordedNative") < safeDeploy.indexOf("Invoke-RecordedNative 'Materialize source-root staging config'"));
check("safe deploy records SHA-256 manifest", safeDeploy.includes("SHA256SUMS.txt") && safeDeploy.includes("Get-FileHash"));
check("safe deploy runs final documentation validation", safeDeploy.includes("npm run verify:final-docs"));
check("safe deploy gathers bookmark before approval", safeDeploy.indexOf("Pre-migration D1 bookmark") < safeDeploy.indexOf("Read-Host 'Type DEPLOY_PRODUCTION"));
check("safe deploy gathers migration lists before approval", safeDeploy.indexOf("Legacy migration list before apply") < safeDeploy.indexOf("Read-Host 'Type DEPLOY_PRODUCTION"));
check("safe deploy gathers rollback versions before approval", safeDeploy.indexOf("Worker version list before approval") < safeDeploy.indexOf("Read-Host 'Type DEPLOY_PRODUCTION"));
check("safe deploy mutates only after approval", safeDeploy.indexOf("Read-Host 'Type DEPLOY_PRODUCTION") < safeDeploy.indexOf("Legacy D1 migration"));
check("safe deploy removes runtime staging config", safeDeploy.includes("Remove-Item -LiteralPath $stagingRuntimeConfigPath"));

const stagingTemplate = text("docs/final-stage08/templates/WRANGLER_STAGING_TEMPLATE.toml");
check("staging template schema is valid at source root", stagingTemplate.startsWith("#:schema node_modules/wrangler/config-schema.json"));
check("staging config template is external-value only", stagingTemplate.includes("<STAGING_DB_V2_UUID>") && stagingTemplate.includes("<STAGING_RATE_NAMESPACE_4>") && !/AUTH_RATE_LIMIT_PEPPER\s*=/.test(stagingTemplate));
check("staging template explains canonical and runtime copies", stagingTemplate.includes("canonical file OUTSIDE") && stagingTemplate.includes(".cpcv-staging.wrangler.toml"));
const stagingRecordTemplate = text("docs/final-stage08/templates/STAGING_ACCEPTANCE_RECORD_TEMPLATE.txt");
check("staging evidence template has fail-closed fields", stagingRecordTemplate.includes("record_format=CPCV_STAGING_ACCEPTANCE_V1") && stagingRecordTemplate.includes("acceptance_items_total=44") && stagingRecordTemplate.includes("acceptance_spec_sha256") && stagingRecordTemplate.includes("acceptance_items_failed=0") && stagingRecordTemplate.includes("production_resources_used=NO") && stagingRecordTemplate.includes("pdf_data_egress=NONE"));

const packageScripts = packageJson.scripts || {};
check("package exposes source manifest commands", packageScripts["manifest:source"] && packageScripts["verify:source-manifest"]);
check("package exposes staging materialization command", packageScripts["staging:materialize-config"]);
check("runtime staging config is ignored", text(".gitignore").includes(".cpcv-staging.wrangler.toml"));

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
