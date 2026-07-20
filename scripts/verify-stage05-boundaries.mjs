import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStageCompatibility } from "./stage-compatibility-checks.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
runStageCompatibility("stage05");

const immutableHashes = {
  "src/auth/permissions.js": "dd3016c47a64249873843f953a1003d42fc52923ddb077ba0aa1a80769312616",
  "src/auth/csrf.js": "68fc7f291a14a45266e9376a0ead492ac8c86ba4f550e0da95ede40d7d0ee77d",
  "src/auth/passwords.js": "2cedbd3afa5311746c55cb9edf83c76365c1aa3969b3eeb6e8bb84d563c248bd",
  "src/comments/cookies.js": "fb0dcfa55a8323591d9739e20d785115700dd32764849002ff82e1e3bb2f2d6f"
};
for (const [path, hash] of Object.entries(immutableHashes)) {
  check(`${path} retains the Stage 4 security contract`, sha256(path) === hash);
}

const migration = text("migrations-v2/0006_manual_moderation.sql");
check("moderation schema is organization and session scoped", migration.includes("PRIMARY KEY (organization_id, live_session_id)") && migration.includes("FOREIGN KEY (organization_id, live_session_id, comment_id)"));
check("moderation action rows are append-only records", migration.includes("CREATE TABLE comment_moderation_actions") && !/CREATE TRIGGER[^;]+DELETE FROM comment_moderation_actions/is.test(migration));
check("deleted comments cannot restore directly to visible", migration.includes("OLD.moderation_state = 'deleted' AND NEW.moderation_state = 'hidden'") && !migration.includes("OLD.moderation_state = 'deleted' AND NEW.moderation_state = 'visible'"));
check("moderation schema stores no IP or device identity", !/ip_address|user_agent|fingerprint|device_id/i.test(migration));

const repository = text("src/moderation/repository.js");
check("single moderation uses optimistic update predicates", repository.includes("moderation_state = ?7 AND updated_at = ?8") && repository.includes("COMMENT_VERSION_CONFLICT"));
check("concurrent duplicate action conflicts map to 409", repository.includes("isModerationVersionConflict") && repository.includes("comment_moderation_actions.result_updated_at"));
check("moderation audit does not embed comment body", !/details[\s\S]{0,200}message:/i.test(repository));

const route = text("src/routes/private-v2.js");
check("bulk moderation is capped and reports per-item results", route.includes("normalizeBulkModerationItems") && route.includes("succeeded:") && route.includes("failed:"));
check("unexpected bulk item failures do not erase known item outcomes", route.includes('error: "INTERNAL_ERROR", status: 500') && route.includes("Stage 5 bulk moderation item failed"));
check("moderation request scope comes from the authorized session", route.includes("organizationId: session.organization_id") && route.includes("liveSessionId: session.id"));
check("clear display remains separate from moderation state", route.includes('action: "comments.cleared"') && route.includes("/clear"));

const validation = text("src/moderation/validation.js");
check("bulk moderation limit is 25", validation.includes("MAX_BULK_MODERATION_ITEMS = 25"));
check("moderation reasons are normalized and limited", validation.includes("normalize(\"NFKC\")") && validation.includes("MODERATION_REASON_TOO_LONG"));

const realtime = text("migrations-v2/0007_realtime.sql") + text("src/realtime/comment-room.js") + text("public/assets/viewer.js");
check("pending comments are not broadcast", realtime.includes("WHEN NEW.moderation_state = 'visible'") && !realtime.includes("WHEN NEW.moderation_state = 'pending'"));
check("Viewer receives both retraction and restoration events", realtime.includes("message:remove") && realtime.includes("message:restore"));

const viewer = text("public/assets/viewer.js");
check("Viewer removes moderated comments from queue DOM and local storage", viewer.includes("removeModeratedComment") && viewer.includes("removeDisplayedComment") && viewer.includes("store.delete(id)"));
const admin = text("public/assets/admin.js");
check("Admin uses expectedUpdatedAt for every moderation request", admin.includes("expectedUpdatedAt: comment.updatedAt"));
check("Admin stops polling outside a selected session", admin.includes("function stopModerationRefresh()") && /function showLogin[\s\S]{0,150}stopModerationRefresh\(\)/.test(admin));
check("Admin does not expose IP or device identifiers", !/ipAddress|userAgent|fingerprint/i.test(admin));
const join = text("public/assets/join.js");
check("student UI distinguishes approval-pending submission", join.includes("承認待ちとして送信しました"));

for (const [mirror, served] of [["public/_admin_spa.html", "public/admin/index.html"], ["public/_j_spa.html", "public/j/index.html"], ["public/_viewer_spa.html", "public/viewer/index.html"]]) {
  check(`Stage 5 static mirror matches served page: ${served}`, text(mirror) === text(served));
}

const packageJson = JSON.parse(text("package.json"));
check("Stage 5 test is part of the full precision suite", packageJson.scripts?.["check:precision"]?.includes("test-moderation-v2.mjs"));
check("Stage 5 local smoke command exists", packageJson.scripts?.["smoke:local:stage05"] === "node scripts/smoke-local-stage05.mjs");
const remoteVerifier = text("scripts/verify-remote-d1.mjs");
check("remote deployment verifies Stage 5 tables and migration", remoteVerifier.includes("session_moderation_settings") && remoteVerifier.includes("comment_moderation_actions") && remoteVerifier.includes("0006_manual_moderation"));
check("remote deployment verifies moderation guard triggers", remoteVerifier.includes("trg_comments_moderation_transition") && remoteVerifier.includes("trg_comments_moderation_timestamp"));

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nStage 5 boundary summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;

function text(path) { return readFileSync(resolve(ROOT, path), "utf8"); }
function sha256(path) {
  const canonical = readFileSync(resolve(ROOT, path), "utf8").replaceAll("\r\n", "\n");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
