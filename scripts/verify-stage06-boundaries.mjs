import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { runStageCompatibility } from "./stage-compatibility-checks.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
runStageCompatibility("stage06");

const migrations = readdirSync(resolve(ROOT, "migrations-v2")).sort();
check("Stage 6 migration remains append-only before Stage 6.5", migrations.includes("0007_realtime.sql") && migrations.indexOf("0007_realtime.sql") < migrations.indexOf("0008_email_auth.sql"), migrations);
const migration = text("migrations-v2/0007_realtime.sql");
for (const table of ["realtime_session_state", "realtime_events", "realtime_connection_tickets"]) {
  check(`Stage 6 table exists in migration: ${table}`, migration.includes(`CREATE TABLE ${table}`));
}
check("realtime sequence is unique per live session", migration.includes("UNIQUE (live_session_id, sequence)"));
check("ticket token hashes are unique", migration.includes("token_hash TEXT NOT NULL UNIQUE"));
check("clear watermark cannot exceed current sequence", migration.includes("last_clear_sequence <= last_sequence"));
check("pending comments do not generate realtime events", migration.includes("WHEN NEW.moderation_state = 'visible'") && !migration.includes("WHEN NEW.moderation_state = 'pending'"));

const repository = text("src/realtime/repository.js");
check("connection ticket lifetime is sixty seconds", repository.includes("const TICKET_TTL_MS = 60_000"));
check("connection ticket consumption is one-time and atomic", repository.includes("SET consumed_at = ?1") && repository.includes("consumed_at IS NULL") && repository.includes("expires_at > ?1"));
check("ticket consumption revalidates auth, membership, and live session state", repository.includes("a.revoked_at IS NULL") && repository.includes("m.status = 'active'") && repository.includes("ls.status = 'active'"));
check("catch-up is bounded to 500 events", repository.includes("MAX_CATCH_UP_EVENTS = 500"));
check("snapshot honors the last display clear watermark", repository.includes("last_clear_sequence") && repository.includes("re.sequence > ?3"));
check("realtime events and tickets have bounded retention", repository.includes("EVENT_TTL_MS") && repository.includes("DELETE FROM realtime_events") && repository.includes("DELETE FROM realtime_connection_tickets"));

const room = text("src/realtime/comment-room.js");
check("Durable Object uses WebSocket Hibernation API", room.includes("acceptWebSocket") && room.includes("getWebSockets") && room.includes("serializeAttachment") && room.includes("deserializeAttachment"));
check("Durable Object rejects oversized client frames", room.includes("MAX_CLIENT_FRAME_BYTES") && room.includes("1009"));
check("Durable Object suppresses already-sent sequences", room.includes("lastSentSequence") && room.includes(">= event.sequence"));
check("Durable Object syncs clients before returning the socket", room.includes('type: "room:sync"') && room.includes("getRealtimeSync"));
check("Durable Object chunks auth revalidation for large socket sets", room.includes("AUTH_REVALIDATION_BATCH_SIZE = 80") && room.includes("ids.slice(offset"));

const route = text("src/routes/private-v2.js");
check("authenticated one-time ticket endpoint is connected", route.includes('parts[4] === "live-ticket"') && route.includes("issueConnectionTicket"));
check("WebSocket connect consumes the ticket before forwarding", route.includes("consumeConnectionTicket") && route.includes('x-realtime-ticket-consumed'));
check("legacy bearer WebSocket subprotocol is stripped", route.includes('headers.set("Upgrade", "websocket")') && !route.includes('headers.set("sec-websocket-protocol"'));
check("room events are persisted before dispatch", route.includes("realtimeEventStatements") && route.includes("dispatchRealtimeEvent"));

const viewer = text("public/assets/viewer.js");
check("Viewer requests one-time tickets", viewer.includes("/live-ticket") && viewer.includes("lastSequence"));
check("Viewer applies sequence duplicate and gap guards", viewer.includes("sequence <= lastAppliedSequence") && viewer.includes("sequence !== lastAppliedSequence + 1"));
check("Viewer reconnect uses bounded exponential backoff", viewer.includes("2 **") && viewer.includes("Math.min(30_000"));
check("Viewer stores only non-secret sequence state", viewer.includes("CPCV_REALTIME_SEQUENCE") && !/localStorage[^\n]*(token|ticket)/i.test(viewer));
check("Viewer stops reconnecting on room closure and auth loss", viewer.includes("room:closed") && viewer.includes("realtimeStopped") && viewer.includes("stopRealtime('認証切れ')"));

const limiter = text("src/realtime/edge-rate-limit.js");
check("public edge limiter hashes rather than stores the client address", limiter.includes("HMAC") && limiter.includes("cf-connecting-ip") && !/INSERT|UPDATE|DELETE/i.test(limiter));
check("production refuses a missing public limiter", limiter.includes("PUBLIC_COMMENT_RATE_LIMITER_NOT_CONFIGURED") && limiter.includes("PUBLIC_RATE_LIMIT_PEPPER_NOT_CONFIGURED"));

const index = text("src/index.js");
check("new CommentRoom class is exported", index.includes('export { CommentRoom } from "./realtime/comment-room.js"'));
check("scheduled maintenance prunes realtime state", index.includes("pruneRealtimeRecords") && index.includes("realtime.backlogRemains"));

const remote = text("scripts/verify-remote-d1.mjs");
check("remote verifier requires Stage 6 schema and migration", remote.includes("realtime_session_state") && remote.includes("realtime_connection_tickets") && remote.includes("0007_realtime"));
const deployment = text("scripts/verify-deployment-config.mjs");
check("deployment verifier requires public comment limiter", deployment.includes("PUBLIC_COMMENT_RATE_LIMITER"));
const workflow = text(".github/workflows/deploy-production.yml");
check("production workflow requires public limiter pepper", workflow.includes("PUBLIC_RATE_LIMIT_PEPPER"));

const packageJson = JSON.parse(text("package.json"));
check("package version preserves the Stage 6 lineage", /^0\.(?:6|7|8)(?:\.|$)/.test(packageJson.version));
check("Stage 6 test is in full precision suite", packageJson.scripts?.["check:precision"]?.includes("test-realtime-v2.mjs"));
check("Stage 6 local smoke command exists", packageJson.scripts?.["smoke:local:stage06"] === "node scripts/smoke-local-stage06.mjs");
check("local development supplies both non-production rate-limit peppers", packageJson.scripts?.dev?.includes("AUTH_RATE_LIMIT_PEPPER:") && packageJson.scripts?.dev?.includes("PUBLIC_RATE_LIMIT_PEPPER:"));

for (const path of [
  "src/realtime/repository.js", "src/realtime/comment-room.js", "src/realtime/edge-rate-limit.js",
  "src/routes/private-v2.js", "src/routes/public-v2.js", "public/assets/viewer.js",
  "scripts/test-realtime-v2.mjs", "scripts/smoke-local-stage06.mjs",
  "scripts/verify-stage06-boundaries.mjs"
]) {
  const syntax = spawnSync(process.execPath, ["--check", resolve(ROOT, path)], { encoding: "utf8" });
  check(`syntax: ${path}`, syntax.status === 0, syntax.stderr || syntax.stdout);
}

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nStage 6 boundary summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
if (failed) process.exitCode = 1;

function text(path) { return readFileSync(resolve(ROOT, path), "utf8"); }
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
