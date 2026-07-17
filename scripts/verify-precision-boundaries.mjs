import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

const migrationFiles = readdirSync(resolve(ROOT, "migrations-v2")).sort();
check("precision migrations are append-only", JSON.stringify(migrationFiles) === JSON.stringify([
  "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
  "0004_precision_hardening.sql", "0005_comment_content_guards.sql",
  "0006_manual_moderation.sql", "0007_realtime.sql", "0008_email_auth.sql", "0009_account_lifecycle.sql",
  "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql", "0015_pdf_page_analytics.sql", "0016_stage08_precision_hardening.sql"
]), migrationFiles);
const csrfMigration = text("migrations-v2/0004_precision_hardening.sql");
check("secondary CSRF table has session cascade", csrfMigration.includes("CREATE TABLE auth_session_csrf_tokens") && csrfMigration.includes("ON DELETE CASCADE"));
check("secondary CSRF expiry index exists", csrfMigration.includes("idx_auth_session_csrf_tokens_expiry"));
const contentMigration = text("migrations-v2/0005_comment_content_guards.sql");
check("database enforces public comment character limits", contentMigration.includes("length(NEW.message) NOT BETWEEN 1 AND 140") && contentMigration.includes("NEW.message_length <> length(NEW.message)") && contentMigration.includes("length(NEW.nickname) > 20"));

const request = text("src/auth/request.js");
check("JSON readers enforce actual streamed byte limits", request.includes("REQUEST_BODY_TOO_LARGE") && request.includes("getReader()") && request.includes("maxBytes"));
const publicRoute = text("src/routes/public-v2.js");
check("public message body uses 4KiB limit", publicRoute.includes("maxBytes: 4096"));

const csrf = text("src/auth/csrf.js");
const csrfTokens = text("src/auth/csrf-tokens.js");
check("CSRF accepts primary and scoped secondary tokens", csrf.includes("isValidSecondaryCsrfToken") && csrfTokens.includes("MAX_SECONDARY_TOKENS_PER_SESSION = 8"));
check("secondary CSRF tokens expire and are capped", csrfTokens.includes("expires_at <=") && csrfTokens.includes("LIMIT -1 OFFSET"));

const repository = text("src/comments/repository.js");
check("participant cleanup is bounded", /DELETE FROM participants[\s\S]*LIMIT \?2/.test(repository));
const worker = text("src/index.js");
check("scheduled maintenance drains all bounded queues", worker.includes("participantsDeleted >= retention.limit") && worker.includes("csrfTokensDeleted >= csrf.limit") && worker.includes("authSessionsDeleted >= auth.limit") && worker.includes("resetTokensDeleted >= auth.limit"));
check("scheduled maintenance reports a remaining bounded backlog", worker.includes("backlog remains"));
check("scheduled maintenance includes realtime retention", worker.includes("pruneRealtimeRecords") && worker.includes("realtime.backlogRemains"));
const commentRoom = text("src/realtime/comment-room.js");
check("WebSocket input closes oversized client frames", commentRoom.includes("1009") && commentRoom.includes("message too large"));
check("HTML security policy is applied", worker.includes("applyHtmlSecurityHeaders"));

const security = text("src/security-headers.js");
for (const header of ["content-security-policy", "x-frame-options", "permissions-policy", "strict-transport-security"]) {
  check(`security header configured: ${header}`, security.includes(header));
}
check("HSTS does not force unrelated subdomains", security.includes('"strict-transport-security": "max-age=31536000"') && !security.includes("includeSubDomains"));
check("CSP blocks framing and objects", security.includes("frame-ancestors 'none'") && security.includes("object-src 'none'"));

const authRoute = text("src/routes/auth.js");
check("production login refuses absent limiter bindings", authRoute.includes("AUTH_RATE_LIMITER_NOT_CONFIGURED"));
check("production login requires Cloudflare client IP", authRoute.includes("AUTH_CLIENT_IP_UNAVAILABLE"));
const privateRoute = text("src/routes/private-v2.js");
check("V2 WebSocket bridge omits obsolete bearer subprotocol", privateRoute.includes('headers.set("Upgrade", "websocket")') && !privateRoute.includes('headers.set("sec-websocket-protocol"'));

const authMaintenance = text("src/auth/maintenance.js");
check("expired authentication records are pruned with a retention delay and batch limit", authMaintenance.includes("DEFAULT_SECURITY_RECORD_RETENTION_DAYS = 7") && authMaintenance.includes("LIMIT ?2") && authMaintenance.includes("password_reset_tokens"));
const participantCookies = text("src/comments/cookies.js");
check("participant token cookie accepts only the issued token length", participantCookies.includes("{43}"));
const viewer = text("public/assets/viewer.js");
check("viewer local logs have retention and hard cap", viewer.includes("pruneLocalLogs") && viewer.includes("MAX_LOCAL_LOG_ENTRIES = 10_000") && viewer.includes("retainedUntil"));
check("viewer pruning avoids quadratic object lookups", viewer.includes("const expiredIds = new Set") && viewer.includes("!expiredIds.has(entry.id)") && !viewer.includes("!expired.includes(entry)"));
const packageVersion = JSON.parse(text("package.json")).version;
check("viewer cache version matches package release", text("public/_viewer_spa.html").includes(`/assets/viewer.js?v=${packageVersion}`));

const appCss = text("public/assets/app.css");
check("page grid cannot expand beyond the mobile viewport", appCss.includes("grid-template-columns: minmax(0, 1fr)") && appCss.includes("overflow-x: hidden"));
check("cards and nested layout containers may shrink below min-content width", appCss.includes(".card { width: 100%; min-width: 0;") && appCss.includes(".section { min-width: 0;") && appCss.includes(".grid { min-width: 0;"));
check("local log table scrolls inside its bounded container", appCss.includes(".local-log-table-wrap { width: 100%; min-width: 0; max-width: 100%; overflow: auto;") && appCss.includes(".local-log-table { width: 100%; min-width: 560px;"));
for (const [mirror, served] of [["public/_admin_spa.html", "public/admin/index.html"], ["public/_j_spa.html", "public/j/index.html"], ["public/_viewer_spa.html", "public/viewer/index.html"]]) {
  check(`static mirror matches served page: ${served}`, text(mirror) === text(served));
}
for (const name of ["join-desktop", "join-mobile", "admin-desktop", "admin-mobile", "master-desktop", "master-mobile", "viewer-desktop", "viewer-mobile"]) {
  const measurement = JSON.parse(text(`docs/stage04-precision-screenshots/${name}.json`));
  check(`visual viewport has no page-level horizontal overflow: ${name}`, measurement.scrollWidth <= measurement.innerWidth);
}

const wrangler = text("wrangler.toml");
check("retention Cron is configured", /\[triggers\][\s\S]*crons\s*=\s*\[\s*"17 3 \* \* \*"\s*\]/.test(wrangler));
check("no invented Rate Limiting namespace is committed", !/^namespace_id\s*=/m.test(wrangler));

const ci = text(".github/workflows/ci.yml");
check("CI runs all implemented-stage tests", ci.includes("npm run check:stage08") && ci.includes("npm run test:owner-bootstrap") && ci.includes("timeout-minutes: 60"));
check("CI has no Cloudflare credentials or deploy command", !/CLOUDFLARE_API_TOKEN|wrangler deploy|--remote/.test(ci));
const deploy = text(".github/workflows/deploy-production.yml");
const safeDeploy = text("scripts/safe-deploy.ps1");
check("production deployment is manual", deploy.includes("workflow_dispatch") && !/^\s*push:/m.test(deploy));
check("production deployment requires an immutable full commit SHA", deploy.includes("commit_sha") && deploy.includes("[0-9a-fA-F]{40}") && deploy.includes("git rev-parse HEAD"));
check("production deployment applies both migration sets", deploy.includes("migrations apply class_comment_db --remote") && deploy.includes("migrations apply class_comment_db_v2 --remote"));
check("production deployment verifies D1 integrity and active Owner", deploy.includes("node scripts/verify-remote-d1.mjs"));
check("production deployment requires rate-limit peppers and Turnstile secret", deploy.includes("AUTH_RATE_LIMIT_PEPPER") && deploy.includes("PUBLIC_RATE_LIMIT_PEPPER") && deploy.includes("TURNSTILE_SECRET_KEY"));
check("production deployment runs post-deploy smoke tests", deploy.includes("Run production smoke checks") && deploy.includes("node scripts/smoke-production.mjs"));
check("legacy MASTER_TOKEN deployment was removed", !deploy.includes("MASTER_TOKEN"));


const bootstrapCli = text("scripts/bootstrap-owner.mjs");
const bootstrapWorker = text("scripts/bootstrap-owner-worker.mjs");
check("local Owner bootstrap uses direct SQLite transaction instead of a local dev Worker", bootstrapCli.includes("bootstrapLocalDatabase") && bootstrapCli.includes("BEGIN IMMEDIATE") && bootstrapCli.includes("ROLLBACK"));
check("bootstrap validates required core schema while allowing later migrations", bootstrapCli.includes("REQUIRED_CORE_SCHEMA_OBJECTS") && bootstrapWorker.includes("EXPECTED_CORE_SCHEMA_OBJECTS") && bootstrapWorker.includes("EXPECTED_APPLICATION_TABLES.some"));
check("remote bootstrap terminates detached Wrangler descendants", bootstrapCli.includes("listDescendantPids") && bootstrapCli.includes("bootstrapTrackedPids"));
const bootstrapSuite = text("scripts/test-bootstrap-owner-v2.mjs");
check("bootstrap tests cover latest schema rollback and repeat rejection", bootstrapSuite.includes("latest-schema") && bootstrapSuite.includes("rollback") && bootstrapSuite.includes("second-bootstrap"));
check("bootstrap test process exits after synchronous assertions", bootstrapSuite.includes("process.exit(passed === 40"));
check("local bootstrap selects DB_V2 when legacy D1 coexists", bootstrapCli.includes("isLocalDbV2Database") && bootstrapSuite.includes("coexisting legacy D1"));
const organizationRoute = text("src/routes/organization.js");
check("organization 204 responses retain the full auth security header set", organizationRoute.includes("return authJson(null, 204)"));
check("QR SVG responses use restrictive security headers", worker.includes("content-security-policy") && worker.includes("default-src 'none'; sandbox") && worker.includes("...BASE_SECURITY_HEADERS"));

const packageJson = JSON.parse(text("package.json"));
check("precision test script covers deployment verifiers and Stage 2-6", packageJson.scripts?.["check:precision"]?.includes("test-deployment-verifiers.mjs") && packageJson.scripts?.["check:precision"]?.includes("test-comments-v2.mjs") && packageJson.scripts?.["check:precision"]?.includes("test-moderation-v2.mjs") && packageJson.scripts?.["check:precision"]?.includes("test-realtime-v2.mjs"));
check("Stage 6.5 check covers email registration and account lifecycle", packageJson.scripts?.["check:stage06-5"]?.includes("test-email-auth-v2.mjs") && packageJson.scripts?.["check:stage06-5"]?.includes("test-account-lifecycle-v2.mjs"));
check("safe deploy executes the current Stage 8 check", safeDeploy.includes("npm run check:stage08") && safeDeploy.includes("npm run verify:ai-ready") && safeDeploy.includes("d1 time-travel info class_comment_db_v2"));
check("safe deploy checks email cutover readiness and Turnstile secret", safeDeploy.includes("verify:email-auth-ready") && safeDeploy.includes("TURNSTILE_SECRET_KEY"));
check("authentication secret configurator includes Turnstile", text("scripts/configure-rate-limit-secret.mjs").includes("TURNSTILE_SECRET_KEY"));
check("remote DB_V2 migration script uses database name", packageJson.scripts?.["db:v2:migrate:remote"] === "wrangler d1 migrations apply class_comment_db_v2 --remote");
check("deployment config verifier exists", packageJson.scripts?.["verify:deployment"] === "node scripts/verify-deployment-config.mjs");
check("local dev supplies both non-production rate-limit peppers", packageJson.scripts?.dev?.includes("AUTH_RATE_LIMIT_PEPPER:local-development-only-pepper-change-before-deploy") && packageJson.scripts?.dev?.includes("PUBLIC_RATE_LIMIT_PEPPER:local-public-rate-limit-pepper-change-before-deploy"));
check("reusable local Stage 4 smoke test is available", packageJson.scripts?.["smoke:local:stage04"] === "node scripts/smoke-local-stage04.mjs" && text("scripts/smoke-local-stage04.mjs").includes("idempotentReplayVerified"));
check("reusable local Stage 5 smoke test is available", packageJson.scripts?.["smoke:local:stage05"] === "node scripts/smoke-local-stage05.mjs" && text("scripts/smoke-local-stage05.mjs").includes("premoderationVerified"));
check("reusable local Stage 6 smoke test is available", packageJson.scripts?.["smoke:local:stage06"] === "node scripts/smoke-local-stage06.mjs" && text("scripts/smoke-local-stage06.mjs").includes("catchUpVerified"));

for (const path of [
  "src/auth/request.js", "src/auth/csrf.js", "src/auth/csrf-tokens.js", "src/auth/maintenance.js", "src/routes/auth.js",
  "src/routes/public-v2.js", "src/routes/private-v2.js", "src/comments/repository.js",
  "src/realtime/repository.js", "src/realtime/comment-room.js", "src/realtime/edge-rate-limit.js",
  "src/security-headers.js", "src/index.js", "public/assets/viewer.js",
  "scripts/predeploy-check.mjs", "scripts/verify-deployment-config.mjs",
  "scripts/verify-d1-query-result.mjs", "scripts/print-production-origin.mjs",
  "scripts/verify-remote-d1.mjs", "scripts/verify-email-auth-readiness.mjs", "scripts/configure-rate-limit-secret.mjs",
  "scripts/smoke-production.mjs", "scripts/test-deployment-verifiers.mjs",
  "scripts/test-realtime-v2.mjs", "scripts/test-email-auth-v2.mjs", "scripts/test-account-lifecycle-v2.mjs", "scripts/test-ai-v2.mjs", "scripts/smoke-local-stage06.mjs", "scripts/verify-stage06-boundaries.mjs", "scripts/verify-stage06-5-boundaries.mjs", "scripts/verify-stage07-boundaries.mjs", "scripts/verify-stage07-5-boundaries.mjs", "scripts/test-content-filter-v2.mjs", "scripts/verify-ai-readiness.mjs",
  "scripts/bootstrap-owner.mjs", "scripts/bootstrap-owner-worker.mjs",
  "scripts/test-bootstrap-owner-v2.mjs", "scripts/test-db-v2.mjs", "scripts/test-db-v2-schema.mjs"
]) {
  const syntax = spawnSync(process.execPath, ["--check", resolve(ROOT, path)], { encoding: "utf8" });
  check(`syntax: ${path}`, syntax.status === 0, syntax.stderr || syntax.stdout);
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nPrecision boundary summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;

function text(path) { return readFileSync(resolve(ROOT, path), "utf8"); }
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
