import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const LEGACY_MIGRATION_HASHES = Object.freeze({
  "migrations/0001_init.sql": "6d2e2f68754438e7b53cfb0db01487724016ed96ec27e92a8bdb2611fe135bb4",
  "migrations/0002_drop_documents.sql": "f834eb5df2b95bd4355ed8ab339cc8c9e3b6f77aef364088e5dddd1e1f15a323",
  "migrations/0003_add_comment_display_seconds.sql": "3aaff2bc9cf896496756cd4fa82fb0500d0c63e1eb137e548f693d0d5243aecc",
  "migrations/0004_master_auth.sql": "d9e1135d27df7361c07ba7fa2dca0deead8dff89414f3c514c356d7bc423fe10",
  "migrations/0005_comment_display_mode.sql": "640c3f921fc617c56127d4142dfe110bdd2a9a92698bbc4fddf95baaa9c96956"
});

export function runStageCompatibility(stage) {
  const results = [];
  const check = (name, condition, detail = "") => {
    const ok = Boolean(condition);
    results.push({ name, ok });
    console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
    if (!ok && detail) console.error(detail);
  };
  const requireFile = (path) => {
    try { read(path); check(`${path} exists`, true); return true; }
    catch (error) { check(`${path} exists`, false, error.message); return false; }
  };

  if (!["stage02", "stage03a", "stage03b", "stage03c", "stage04", "stage05", "stage06"].includes(stage)) {
    throw new TypeError(`Unsupported compatibility stage: ${stage}`);
  }

  for (const [path, expected] of Object.entries(LEGACY_MIGRATION_HASHES)) {
    check(`${path} retains the immutable legacy migration`, sha256(path) === expected);
  }

  const wrangler = read("wrangler.toml");
  check("legacy DB binding remains present", hasBinding(wrangler, "DB", "class_comment_db"));
  check("DB_V2 binding remains separate", hasBinding(wrangler, "DB_V2", "class_comment_db_v2") && /migrations_dir\s*=\s*"migrations-v2"/.test(wrangler));
  check("local development commands do not use remote D1", !/--remote/.test(packageScript("dev")) && !/--remote/.test(packageScript("db:dev:migrate")));

  requireFile("migrations-v2/0001_initial_schema.sql");
  requireFile("scripts/bootstrap-owner.mjs");
  requireFile("scripts/test-db-v2.mjs");

  if (stage !== "stage02") {
    requireFile("migrations-v2/0002_auth_security.sql");
    for (const path of [
      "src/auth/cookies.js", "src/auth/csrf.js", "src/auth/middleware.js",
      "src/auth/passwords.js", "src/auth/permissions.js", "src/auth/sessions.js"
    ]) requireFile(path);
    const passwords = read("src/auth/passwords.js");
    check("current password scheme uses PBKDF2-SHA-256 with 600000 iterations", passwords.includes("600_000") || passwords.includes("600000"));
    const csrf = read("src/auth/csrf.js");
    check("unsafe authenticated requests require origin, JSON, and CSRF checks", ["requireSameOrigin", "requireJsonContentType", "requireCsrf"].every((marker) => csrf.includes(marker)));
  }

  if (["stage03b", "stage03c", "stage04", "stage05", "stage06"].includes(stage)) {
    requireFile("src/routes/auth.js");
    requireFile("src/routes/organization.js");
    const index = read("src/index.js");
    check("authentication and organization routes remain connected", index.includes("handleAuthApi") && index.includes("handleOrganizationApi"));
    const auth = read("src/routes/auth.js");
    check("Stage 3-B authentication endpoints remain implemented", ["/login", "/logout", "/session", "/password/change", "/password/reset"].every((marker) => auth.includes(marker)));
    const organization = read("src/routes/organization.js");
    check("organization management retains last-Owner and session-revocation protections", organization.includes("LAST_OWNER_REQUIRED") && organization.includes("auth_sessions"));
  }

  if (["stage03c", "stage04", "stage05", "stage06"].includes(stage)) {
    for (const path of ["src/routes/private-v2.js", "src/db/live-session-projection.js", "public/assets/admin.js", "public/assets/master.js", "public/assets/viewer.js"]) requireFile(path);
    const index = read("src/index.js");
    check("AUTH_V2 is required in production", index.includes("AUTH_V2_REQUIRED") && wrangler.includes('AUTH_V2_ENABLED = "1"'));
    for (const path of ["public/assets/admin.js", "public/assets/master.js", "public/assets/viewer.js"]) {
      const source = read(path);
      check(`${path} has no legacy Bearer browser authentication`, !/authorization\s*:|Bearer\s+|CPCV_(?:TEACHER|MASTER)_SESSION/i.test(source));
      check(`${path} restores a Cookie session`, source.includes("/api/auth/session") && source.includes("credentials: 'same-origin'"));
    }
    check("Viewer WebSocket uses the authenticated ticket bridge", read("public/assets/viewer.js").includes("live-ticket") && read("public/assets/viewer.js").includes("new WebSocket(wsUrl)"));
  }

  if (["stage04", "stage05", "stage06"].includes(stage)) {
    for (const path of ["migrations-v2/0003_comments.sql", "src/comments/repository.js", "src/routes/public-v2.js", "scripts/test-comments-v2.mjs"]) requireFile(path);
    const migration = read("migrations-v2/0003_comments.sql");
    check("comment persistence tables remain present", ["CREATE TABLE participants", "CREATE TABLE comments", "CREATE TABLE comment_events"].every((marker) => migration.includes(marker)));
    check("comment schema does not store IP, user-agent, or device fingerprint", !/\b(ip_address|user_agent|fingerprint)\b/i.test(migration));
    const join = read("public/assets/join.js");
    check("student client sends idempotency keys without persistent browser identity", join.includes("idempotencyKey") && !/cpcv_client_id|x-client-id/.test(join));
    const admin = read("public/assets/admin.js");
    check("admin comment cache does not expose obsolete IP fields", !admin.includes("ipAddress"));
  }

  if (["stage05", "stage06"].includes(stage)) {
    for (const path of [
      "migrations-v2/0006_manual_moderation.sql",
      "src/moderation/repository.js",
      "src/moderation/validation.js",
      "scripts/test-moderation-v2.mjs"
    ]) requireFile(path);
    const moderationMigration = read("migrations-v2/0006_manual_moderation.sql");
    check("manual moderation tables and transition guards remain present",
      moderationMigration.includes("CREATE TABLE session_moderation_settings")
      && moderationMigration.includes("CREATE TABLE comment_moderation_actions")
      && moderationMigration.includes("trg_comments_moderation_transition")
      && moderationMigration.includes("trg_comments_moderation_timestamp"));
    const moderationRoute = read("src/routes/private-v2.js");
    check("single and bulk moderation APIs remain connected", moderationRoute.includes("moderate-bulk") && moderationRoute.includes("moderateSingleComment") && moderationRoute.includes("getCommentModerationHistory"));
    const realtime = read("migrations-v2/0007_realtime.sql") + read("src/realtime/comment-room.js") + read("public/assets/viewer.js");
    check("Viewer retraction and restoration events remain supported", realtime.includes("message:remove") && realtime.includes("message:restore"));
    check("Stage 5 does not add AI or translation dependencies", !/openai|anthropic|translate|translation/i.test(read("package.json")));
  }

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\n${stage} compatibility summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
  return { passed, failed, total: results.length };
}

function read(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}
function sha256(path) {
  return createHash("sha256").update(readFileSync(resolve(ROOT, path))).digest("hex");
}
function hasBinding(text, binding, databaseName) {
  const blocks = text.match(/\[\[d1_databases\]\][\s\S]*?(?=\n\[\[|\n\[[^\[]|$)/g) || [];
  return blocks.some((block) => block.includes(`binding = "${binding}"`) && block.includes(`database_name = "${databaseName}"`));
}
function packageScript(name) {
  const packageJson = JSON.parse(read("package.json"));
  return String(packageJson.scripts?.[name] || "");
}
