import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { CommentRoom } from "../src/index.js";
import { createToken, hashToken } from "../src/auth/passwords.js";
import { persistComment, runCommentRetention } from "../src/comments/repository.js";
import { containsUrlLikeContent, normalizeCommentInput } from "../src/comments/validation.js";
import { moderateComment } from "../src/moderation/repository.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const results = [];

async function main() {
  await runGroup("schema and database guards", testSchema);
  await runGroup("premoderation persistence", testPremoderationPersistence);
  await runGroup("single moderation transitions", testSingleTransitions);
  await runGroup("concurrent moderation conflicts", testConcurrentModerationConflict);
  await runGroup("authorization boundaries", testAuthorizationBoundaries);
  await runGroup("bulk moderation", testBulkModeration);
  await runGroup("fault rollback", testFaultRollback);
  await runGroup("clear and retention semantics", testClearAndRetention);
  await runGroup("session moderation settings", testSessionSettings);
  await runGroup("URL hardening", testUrlHardening);
  testStaticClientBoundary();

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 5 manual moderation test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function runGroup(name, fn) {
  const h = await createHarness();
  try { await fn(h); }
  catch (error) { check(`${name}: unexpected group error`, false, error); }
  finally { h.close(); }
}

async function testSchema(h) {
  const tables = h.rows("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('session_moderation_settings','comment_moderation_actions') ORDER BY name").map((row) => row.name);
  check("Stage 5 creates moderation tables", JSON.stringify(tables) === JSON.stringify(["comment_moderation_actions", "session_moderation_settings"]), tables);
  const triggers = h.rows("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'trg_comments_moderation_%' ORDER BY name").map((row) => row.name);
  check("moderation transition and timestamp triggers exist", JSON.stringify(triggers) === JSON.stringify(["trg_comments_moderation_timestamp", "trg_comments_moderation_transition"]), triggers);
  check("Stage 5 foreign keys are clean", h.rows("PRAGMA foreign_key_check").length === 0);
  check("Stage 5 quick check is ok", h.row("PRAGMA quick_check")?.quick_check === "ok");

  const comment = await insertComment(h, "schema_guard_key_01", "guard", "n", Date.now() - 5000);
  await expectSqlFailure("database rejects visible to pending", () => h.exec(`UPDATE comments SET moderation_state='pending', updated_at='${new Date(Date.now() + 1000).toISOString()}' WHERE id='${comment.comment.id}'`), /invalid moderation transition/i);
  await expectSqlFailure("database requires moderation timestamp advance", () => h.exec(`UPDATE comments SET moderation_state='hidden', updated_at=updated_at WHERE id='${comment.comment.id}'`), /moderation timestamp must advance/i);
  await expectSqlFailure("database rejects invalid moderation mode", () => h.exec(`INSERT INTO session_moderation_settings VALUES ('org_a','${h.sessionId}','manual','usr_teacher_a','${h.createdAt}','${h.createdAt}')`), /check constraint/i);

  const deleted = await insertComment(h, "schema_guard_key_02", "deleted guard", "n", Date.now() + 10000);
  const deletedAt = new Date(Date.parse(deleted.comment.updatedAt) + 1000).toISOString();
  h.exec(`UPDATE comments SET moderation_state='deleted', deleted_at='${deletedAt}', updated_at='${deletedAt}' WHERE id='${deleted.comment.id}'`);
  await expectSqlFailure("database blocks direct deleted to visible restore", () => h.exec(`UPDATE comments SET moderation_state='visible', deleted_at=NULL, updated_at='${new Date(Date.parse(deletedAt) + 1000).toISOString()}' WHERE id='${deleted.comment.id}'`), /invalid moderation transition/i);
}

async function testPremoderationPersistence(h) {
  h.exec(`INSERT INTO session_moderation_settings VALUES ('org_a','${h.sessionId}','pre','usr_teacher_a','${h.createdAt}','${h.createdAt}')`);
  let response = await h.api(`/api/public/sessions/${h.publicCode}`);
  const sessionBody = await response.json();
  const cookie = response.headers.get("set-cookie").split(";")[0];
  check("public session advertises approval requirement", response.status === 200 && sessionBody.requiresApproval === true, sessionBody);

  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: "student", message: "approval please", idempotencyKey: "pending_key_000001" }
  });
  const pending = await response.json();
  check("premoderated comment returns 202", response.status === 202 && pending.moderationState === "pending", pending);
  check("premoderated comment is stored pending", h.row("SELECT moderation_state FROM comments WHERE id=?1", pending.commentId)?.moderation_state === "pending");
  check("pending comment is not broadcast", !h.rooms.broadcasts.some((payload) => payload.id === pending.commentId), h.rooms.broadcasts);

  response = await h.api(`/api/private/sessions/${h.sessionId}/comments?state=pending`, { actor: "teacherA" });
  const pendingList = await response.json();
  check("pending state filter returns pending comment", response.status === 200 && pendingList.comments.length === 1 && pendingList.comments[0].id === pending.commentId, pendingList);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments?state=visible`, { actor: "teacherA" });
  check("visible filter excludes pending comment", response.status === 200 && (await response.json()).comments.length === 0);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments?state=unknown`, { actor: "teacherA" });
  check("invalid state filter is rejected", response.status === 400 && (await response.json()).error === "MODERATION_STATE_FILTER_INVALID");
}

async function testSingleTransitions(h) {
  const created = await insertComment(h, "transition_key_001", "transition", "name", Date.now() - 5000);
  let comment = created.comment;

  let response = await moderateApi(h, "teacherA", comment, "hide", "  Ａ\u0001  B  ");
  let body = await response.json();
  check("visible comment can be hidden", response.status === 200 && body.comment.moderationState === "hidden" && body.realtimeDelivered === true, body);
  comment = body.comment;
  check("hide broadcasts removal", h.rooms.broadcasts.some((payload) => payload.type === "message:remove" && payload.commentId === comment.id && payload.moderationState === "hidden"));

  response = await moderateApi(h, "teacherA", comment, "restore");
  body = await response.json();
  check("hidden comment can be restored visible", response.status === 200 && body.comment.moderationState === "visible", body);
  comment = body.comment;
  check("restore broadcasts full comment", h.rooms.broadcasts.some((payload) => payload.type === "message:restore" && payload.id === comment.id && payload.message === "transition"));

  response = await moderateApi(h, "teacherA", comment, "delete", "remove from record view");
  body = await response.json();
  check("visible comment can be logically deleted", response.status === 200 && body.comment.moderationState === "deleted" && body.comment.deletedAt, body);
  comment = body.comment;

  response = await moderateApi(h, "teacherA", comment, "restore");
  body = await response.json();
  check("deleted restore returns to hidden safe-side state", response.status === 200 && body.comment.moderationState === "hidden" && body.comment.deletedAt === null, body);
  comment = body.comment;

  response = await moderateApi(h, "teacherA", comment, "restore");
  body = await response.json();
  check("second restore makes hidden comment visible", response.status === 200 && body.comment.moderationState === "visible", body);
  comment = body.comment;

  const actionRows = h.rows("SELECT action,from_state,to_state,reason FROM comment_moderation_actions WHERE comment_id=?1 ORDER BY created_at", comment.id);
  check("all moderation actions are preserved with normalized reason", actionRows.length === 5 && actionRows[0].reason === "A B", actionRows);
  check("generic audit logs are written without comment content", h.rows("SELECT action,details_json FROM audit_logs WHERE target_id=?1 ORDER BY created_at", comment.id).every((row) => !String(row.details_json).includes("transition")));

  response = await moderateApi(h, "teacherA", comment, "approve");
  check("invalid visible approve is rejected", response.status === 409 && (await response.json()).error === "MODERATION_TRANSITION_INVALID");
  const stale = { ...comment, updatedAt: created.comment.updatedAt };
  response = await moderateApi(h, "teacherA", stale, "hide");
  check("stale optimistic version is rejected", response.status === 409 && (await response.json()).error === "COMMENT_VERSION_CONFLICT");

  const validation = await insertComment(h, "transition_validation_key", "validation", "n", Date.now() + 120000);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/${encodeURIComponent(validation.comment.id)}/moderate`, {
    method: "POST", actor: "teacherA", body: { action: "hide", expectedUpdatedAt: "yesterday" }
  });
  check("malformed expected timestamp is rejected", response.status === 400 && (await response.json()).error === "EXPECTED_UPDATED_AT_INVALID");
  response = await moderateApi(h, "teacherA", validation.comment, "hide", "x".repeat(201));
  check("overlong moderation reason is rejected", response.status === 400 && (await response.json()).error === "MODERATION_REASON_TOO_LONG");
  check("validation failures do not change comment state", h.row("SELECT moderation_state FROM comments WHERE id=?1", validation.comment.id)?.moderation_state === "visible");
}


async function testConcurrentModerationConflict(h) {
  const created = await insertComment(h, "concurrent_mod_key", "concurrent", "n", Date.now() - 5000);
  const input = {
    organizationId: "org_a",
    liveSessionId: h.sessionId,
    commentId: created.comment.id,
    action: "hide",
    expectedUpdatedAt: created.comment.updatedAt,
    reason: null,
    actorUserId: "usr_teacher_a",
    actorRole: "teacher",
    now: Date.now()
  };
  const settled = await Promise.allSettled([
    moderateComment(h.env.DB_V2, input),
    moderateComment(h.env.DB_V2, input)
  ]);
  const fulfilled = settled.filter((item) => item.status === "fulfilled");
  const rejected = settled.filter((item) => item.status === "rejected");
  check("concurrent same-version moderation has one winner", fulfilled.length === 1 && rejected.length === 1, settled);
  check("concurrent loser receives version conflict", rejected[0]?.reason?.status === 409 && rejected[0]?.reason?.code === "COMMENT_VERSION_CONFLICT", rejected[0]?.reason);
  check("concurrent conflict writes one action and one audit", h.rows("SELECT id FROM comment_moderation_actions WHERE comment_id=?1", created.comment.id).length === 1 && h.rows("SELECT id FROM audit_logs WHERE target_id=?1 AND action='comment.moderation.hide'", created.comment.id).length === 1);
}

async function testAuthorizationBoundaries(h) {
  const created = await insertComment(h, "auth_boundary_key", "private", "n", Date.now() - 5000);
  let response = await moderateApi(h, "teacherB", created.comment, "hide");
  check("teacher cannot moderate another teacher session", response.status === 404 && (await response.json()).error === "SESSION_NOT_FOUND");
  response = await moderateApi(h, "ownerB", created.comment, "hide");
  check("other organization cannot moderate comment", response.status === 404 && (await response.json()).error === "SESSION_NOT_FOUND");
  response = await moderateApi(h, "adminA", created.comment, "hide");
  check("same organization admin can moderate", response.status === 200 && (await response.json()).comment.moderationState === "hidden");

  const directRoom = h.rooms.raw(h.sessionId);
  response = await directRoom.fetch(new Request("https://comment-room/moderation", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ comment: created.comment })
  }));
  check("direct unverified moderation broadcast is rejected", response.status === 401);
}

async function testBulkModeration(h) {
  h.exec(`INSERT INTO session_moderation_settings VALUES ('org_a','${h.sessionId}','pre','usr_teacher_a','${h.createdAt}','${h.createdAt}')`);
  const comments = [];
  for (let index = 0; index < 3; index += 1) {
    comments.push((await insertComment(h, `bulk_key_000000${index}`, `bulk ${index}`, "n", Date.now() + index * 20_000)).comment);
  }
  check("bulk fixtures are pending", comments.every((comment) => comment.moderationState === "pending"), comments);
  const items = [
    { commentId: comments[0].id, action: "approve", expectedUpdatedAt: comments[0].updatedAt },
    { commentId: comments[1].id, action: "approve", expectedUpdatedAt: "2000-01-01T00:00:00.000Z" },
    { commentId: comments[2].id, action: "hide", expectedUpdatedAt: comments[2].updatedAt }
  ];
  let response = await h.api(`/api/private/sessions/${h.sessionId}/comments/moderate-bulk`, { method: "POST", actor: "teacherA", body: { items } });
  const body = await response.json();
  check("bulk operation returns per-item partial results", response.status === 200 && body.succeeded === 2 && body.failed === 1, body);
  check("bulk successful actions persist independently", h.row("SELECT moderation_state FROM comments WHERE id=?1", comments[0].id)?.moderation_state === "visible" && h.row("SELECT moderation_state FROM comments WHERE id=?1", comments[2].id)?.moderation_state === "hidden");
  check("bulk failed item remains unchanged", h.row("SELECT moderation_state FROM comments WHERE id=?1", comments[1].id)?.moderation_state === "pending");

  const faultComments = [];
  for (let index = 0; index < 3; index += 1) {
    faultComments.push((await insertComment(h, `bulk_fault_key_000${index}`, `fault ${index}`, "n", Date.now() + 100_000 + index * 20_000)).comment);
  }
  h.exec(`CREATE TRIGGER fail_selected_bulk_action BEFORE INSERT ON comment_moderation_actions WHEN NEW.comment_id='${faultComments[1].id}' BEGIN SELECT RAISE(ABORT, 'forced selected bulk failure'); END;`);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/moderate-bulk`, {
    method: "POST",
    actor: "teacherA",
    body: { items: faultComments.map((comment) => ({ commentId: comment.id, action: "approve", expectedUpdatedAt: comment.updatedAt })) }
  });
  const faultBody = await response.json();
  check("bulk unexpected item failure remains a per-item result", response.status === 200 && faultBody.succeeded === 2 && faultBody.failed === 1 && faultBody.results[1].error === "INTERNAL_ERROR" && faultBody.results[1].status === 500, faultBody);
  check("bulk continues after an unexpected item failure", h.row("SELECT moderation_state FROM comments WHERE id=?1", faultComments[0].id)?.moderation_state === "visible" && h.row("SELECT moderation_state FROM comments WHERE id=?1", faultComments[1].id)?.moderation_state === "pending" && h.row("SELECT moderation_state FROM comments WHERE id=?1", faultComments[2].id)?.moderation_state === "visible");

  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/moderate-bulk`, {
    method: "POST",
    actor: "teacherA",
    body: { items: Array.from({ length: 26 }, (_, index) => ({ commentId: `cmt_${String(index).padStart(16, "0")}`, action: "delete", expectedUpdatedAt: h.createdAt })) }
  });
  check("bulk operation is capped at 25", response.status === 400 && (await response.json()).error === "MODERATION_BULK_ITEMS_INVALID");

  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/moderate-bulk`, {
    method: "POST", actor: "teacherA",
    body: { items: [
      { commentId: comments[1].id, action: "approve", expectedUpdatedAt: comments[1].updatedAt },
      { commentId: comments[1].id, action: "delete", expectedUpdatedAt: comments[1].updatedAt }
    ] }
  });
  check("bulk operation rejects duplicate comment ids", response.status === 400 && (await response.json()).error === "MODERATION_BULK_DUPLICATE_COMMENT");
}

async function testFaultRollback(h) {
  const created = await insertComment(h, "rollback_mod_key", "rollback", "n", Date.now() - 5000);
  const auditBefore = h.count("audit_logs");
  h.exec(`CREATE TRIGGER fail_moderation_action BEFORE INSERT ON comment_moderation_actions BEGIN SELECT RAISE(ABORT, 'forced moderation failure'); END;`);
  try {
    await moderateComment(h.env.DB_V2, {
      organizationId: "org_a",
      liveSessionId: h.sessionId,
      commentId: created.comment.id,
      action: "hide",
      expectedUpdatedAt: created.comment.updatedAt,
      reason: null,
      actorUserId: "usr_teacher_a",
      actorRole: "teacher",
      now: Date.now()
    });
    check("moderation fault is surfaced", false, "did not throw");
  } catch {
    check("moderation fault is surfaced", true);
  }
  const after = h.row("SELECT moderation_state,updated_at FROM comments WHERE id=?1", created.comment.id);
  check("moderation action failure rolls back comment state", after.moderation_state === "visible" && after.updated_at === created.comment.updatedAt, after);
  check("moderation action failure rolls back audit", h.count("audit_logs") === auditBefore);
}

async function testClearAndRetention(h) {
  const created = await insertComment(h, "clear_retention_key", "clear", "n", Date.now() - 5000);
  let response = await moderateApi(h, "teacherA", created.comment, "hide");
  const hidden = (await response.json()).comment;
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/clear`, { method: "POST", actor: "teacherA", body: {} });
  check("display clear succeeds", response.status === 200);
  check("display clear does not change moderation state", h.row("SELECT moderation_state FROM comments WHERE id=?1", hidden.id)?.moderation_state === "hidden");

  h.exec(`UPDATE comments SET retained_until='${new Date(Date.parse(hidden.createdAt) + 1000).toISOString()}' WHERE id='${hidden.id}'`);
  const retention = await runCommentRetention(h.env.DB_V2, { now: Date.now(), limit: 500 });
  check("retention physically deletes expired comment", retention.commentsDeleted === 1 && !h.row("SELECT id FROM comments WHERE id=?1", hidden.id));
  check("retention cascades moderation actions", !h.row("SELECT id FROM comment_moderation_actions WHERE comment_id=?1", hidden.id));
}

async function testSessionSettings(h) {
  let response = await h.api(`/api/private/sessions/${h.sessionId}/settings`, {
    method: "POST",
    actor: "teacherA",
    body: { moderationMode: "pre" }
  });
  let body = await response.json();
  check("teacher can enable premoderation on own session", response.status === 200 && body.moderationMode === "pre", body);
  check("session moderation mode is stored separately", h.row("SELECT moderation_mode FROM session_moderation_settings WHERE live_session_id=?1", h.sessionId)?.moderation_mode === "pre");
  response = await h.api(`/api/private/sessions/${h.sessionId}`, { actor: "teacherA" });
  check("session response includes moderation mode", response.status === 200 && (await response.json()).session.moderationMode === "pre");

  response = await h.api("/api/private/sessions", { method: "POST", actor: "teacherA", body: { title: "Premoderated class", moderationMode: "pre" } });
  body = await response.json();
  check("new session can start in premoderation mode", response.status === 201 && body.session.moderationMode === "pre", body);
  check("new session setting is inserted atomically", h.row("SELECT moderation_mode FROM session_moderation_settings WHERE live_session_id=?1", body.sessionId)?.moderation_mode === "pre");
}

async function testUrlHardening() {
  for (const value of ["ftp://example.com", "example.com", "www.example.com", "192.168.1.1", "javascript:alert(1)", "mailto:test@example.com"]) {
    check(`URL-like content is detected: ${value}`, containsUrlLikeContent(value));
    await expectAuthCode(`URL-like comment is rejected: ${value}`, () => normalizeCommentInput({ message: value, idempotencyKey: `url_key_${crypto.randomUUID()}` }), "URL_NOT_ALLOWED");
  }
  check("decimal number is not treated as URL", !containsUrlLikeContent("value is 3.14"));
}

function testStaticClientBoundary() {
  const viewer = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");
  const admin = readFileSync(resolve(ROOT, "public/assets/admin.js"), "utf8");
  const adminHtml = readFileSync(resolve(ROOT, "public/_admin_spa.html"), "utf8");
  const join = readFileSync(resolve(ROOT, "public/assets/join.js"), "utf8");
  check("viewer handles moderation removal", viewer.includes("message:remove") && viewer.includes("removeModeratedComment"));
  check("viewer handles approved and restored comments", viewer.includes("message:restore"));
  check("admin includes moderation API operations", admin.includes("moderate-bulk") && admin.includes("expectedUpdatedAt"));
  check("admin stops moderation polling when leaving a session", admin.includes("function stopModerationRefresh()") && admin.includes("showLogin(message") && admin.includes("stopModerationRefresh();"));
  check("admin moderation UI exists", adminHtml.includes('id="moderationBody"') && adminHtml.includes('id="moderationMode"'));
  check("student UI explains pending submission", join.includes("承認待ちとして送信しました"));
}

async function moderateApi(h, actor, comment, action, reason = undefined) {
  return h.api(`/api/private/sessions/${h.sessionId}/comments/${encodeURIComponent(comment.id)}/moderate`, {
    method: "POST",
    actor,
    body: { action, expectedUpdatedAt: comment.updatedAt, ...(reason === undefined ? {} : { reason }) }
  });
}

async function insertComment(h, key, message, nickname, now) {
  return persistComment(h.env.DB_V2, {
    organizationId: "org_a",
    liveSessionId: h.sessionId,
    participantTokenHash: await hashToken(`token-${key}`),
    retentionDays: 30,
    nickname,
    message,
    messageLength: Array.from(message).length,
    idempotencyKey: key,
    now
  });
}

async function expectAuthCode(name, fn, code) {
  try { await fn(); check(name, false, "did not throw"); }
  catch (error) { check(name, error?.code === code, error); }
}

async function expectSqlFailure(name, fn, pattern) {
  try { await fn(); check(name, false, "did not fail"); }
  catch (error) { check(name, pattern.test(String(error?.message || error)), error); }
}

async function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  const legacy = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  legacy.exec("PRAGMA foreign_keys=ON");
  for (const name of [
    "0001_initial_schema.sql",
    "0002_auth_security.sql",
    "0003_comments.sql",
    "0004_precision_hardening.sql",
    "0005_comment_content_guards.sql",
    "0006_manual_moderation.sql",
    "0007_realtime.sql",
    "0008_email_auth.sql", "0009_account_lifecycle.sql", "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql"
  ]) sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  legacy.exec(`
    CREATE TABLE teachers(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,created_at TEXT NOT NULL);
    CREATE TABLE sessions(id TEXT PRIMARY KEY,public_code TEXT UNIQUE,teacher_id TEXT,title TEXT,posting_enabled INTEGER,comments_visible INTEGER,comment_display_seconds INTEGER,status TEXT,created_at TEXT,ended_at TEXT,comment_display_mode TEXT);
    CREATE TABLE admin_audit_logs(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id TEXT,session_id TEXT,action TEXT,created_at TEXT);
  `);
  const DB_V2 = new D1DatabaseAdapter(sqlite);
  const DB = new D1DatabaseAdapter(legacy);
  const rooms = new RealCommentRoomNamespace();
  const env = { DB_V2, DB, COMMENT_ROOM: rooms, APP_ENV: "local", AUTH_V2_ENABLED: "1", AUTH_ORIGIN: ORIGIN, PUBLIC_ORIGIN: ORIGIN, COMMENT_RETENTION_DAYS: "30" };
  rooms.env = env;
  const seeded = await seed(sqlite, legacy);
  return {
    env,
    rooms,
    actors: seeded.actors,
    sessionId: seeded.sessionId,
    publicCode: seeded.publicCode,
    createdAt: seeded.createdAt,
    api: (path, options = {}) => rawApi(env, path, { ...options, actor: typeof options.actor === "string" ? seeded.actors[options.actor] : options.actor }),
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    exec: (sql) => sqlite.exec(sql),
    count: (table) => Number(queryOne(sqlite, `SELECT COUNT(*) AS count FROM ${table}`)?.count || 0),
    close: () => { sqlite.close(); legacy.close(); }
  };
}

async function seed(sqlite, legacy) {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 60_000).toISOString();
  const future = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  sqlite.exec(`
    INSERT INTO organizations VALUES ('org_a','Organization A','active','${createdAt}','${createdAt}',NULL),('org_b','Organization B','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO users VALUES
      ('usr_owner_a','owner.a','Owner A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL),
      ('usr_admin_a','admin.a','Admin A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL),
      ('usr_teacher_a','teacher.a','Teacher A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL),
      ('usr_teacher_b','teacher.b','Teacher B','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL),
      ('usr_owner_b','owner.b','Owner B','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL);
    INSERT INTO organization_members VALUES
      ('org_a','usr_owner_a','owner','active','${createdAt}','${createdAt}',NULL),
      ('org_a','usr_admin_a','admin','active','${createdAt}','${createdAt}',NULL),
      ('org_a','usr_teacher_a','teacher','active','${createdAt}','${createdAt}',NULL),
      ('org_a','usr_teacher_b','teacher','active','${createdAt}','${createdAt}',NULL),
      ('org_b','usr_owner_b','owner','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO live_sessions VALUES ('sess_stage5','org_a','usr_teacher_a','STG5AA','Stage 5 class',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${future}',NULL,NULL);
  `);
  legacy.exec(`INSERT INTO teachers VALUES ('usr_teacher_a','teacher.a','Teacher A','${createdAt}');`);
  legacy.exec(`INSERT INTO sessions VALUES ('sess_stage5','STG5AA','usr_teacher_a','Stage 5 class',1,1,60,'active','${createdAt}',NULL,'stack3');`);
  const actors = {};
  for (const [key, org, user] of [["ownerA","org_a","usr_owner_a"],["adminA","org_a","usr_admin_a"],["teacherA","org_a","usr_teacher_a"],["teacherB","org_a","usr_teacher_b"],["ownerB","org_b","usr_owner_b"]]) {
    const token = createToken();
    const csrf = createToken();
    runStatement(sqlite.prepare("INSERT INTO auth_sessions VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8,NULL)"), [`ses_${key}`, org, user, await hashToken(token), await hashToken(csrf), createdAt, future, future]);
    actors[key] = { cookie: `cpcv_session_dev=${encodeURIComponent(token)}`, csrf };
  }
  return { actors, sessionId: "sess_stage5", publicCode: "STG5AA", createdAt };
}

async function rawApi(env, path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!options.omitOrigin) headers.set("origin", options.origin || ORIGIN);
  if (options.actor?.cookie) headers.set("cookie", options.actor.cookie);
  if (options.actor?.csrf) headers.set("x-csrf-token", options.actor.csrf);
  if (options.cookie) headers.set("cookie", options.cookie);
  let body;
  if (Object.hasOwn(options, "rawBody")) {
    headers.set("content-type", headers.get("content-type") || "application/json");
    body = String(options.rawBody);
  } else if (Object.hasOwn(options, "body")) {
    headers.set("content-type", headers.get("content-type") || "application/json");
    body = JSON.stringify(options.body);
  }
  const request = new Request(`${ORIGIN}${path}`, { method: options.method || "GET", headers, body });
  return withoutConsoleError(() => worker.fetch(request, env, { waitUntil() {} }));
}

class RealCommentRoomNamespace {
  constructor() { this.env = null; this.rooms = new Map(); this.broadcasts = []; }
  idFromName(name) { return String(name); }
  raw(id) {
    if (!this.rooms.has(id)) {
      const room = new CommentRoom({}, this.env);
      const originalBroadcast = room.broadcast.bind(room);
      room.broadcast = (payload) => { this.broadcasts.push(payload); originalBroadcast(payload); };
      this.rooms.set(id, room);
    }
    return this.rooms.get(id);
  }
  get(id) {
    const room = this.raw(id);
    return { fetch(input, init = {}) { return room.fetch(input instanceof Request ? input : new Request(String(input), init)); } };
  }
}

class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const output = statements.map((statement) => statement.executeRun());
      this.sqlite.exec("COMMIT");
      return output;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }
  async exec(sql) { this.sqlite.exec(sql); return { count: 0, duration: 0 }; }
}

class D1PreparedAdapter {
  constructor(sqlite, sql, values = []) { this.sqlite = sqlite; this.sql = sql; this.values = values; }
  bind(...values) { return new D1PreparedAdapter(this.sqlite, this.sql, values); }
  async first(column) { const row = this.executeGet(); return column ? row?.[column] ?? null : row ?? null; }
  async all() { return { success: true, results: this.executeAll(), meta: {} }; }
  async run() { return this.executeRun(); }
  executeGet() { return getStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeAll() { return allStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeRun() { const result = runStatement(this.sqlite.prepare(this.sql), this.values, this.sql); return { success: true, results: [], meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } }; }
}

function parameterObject(sql, values) {
  const matches = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
  if (!matches.length) return null;
  const object = {};
  for (const index of new Set(matches)) object[String(index)] = values[index - 1] ?? null;
  return object;
}
function runStatement(statement, values, sql = statement.sourceSQL || "") { const object = parameterObject(sql, values); return object ? statement.run(object) : statement.run(...values); }
function getStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.get(object) : statement.get(...values); }
function allStatement(statement, sql, values) { const object = parameterObject(sql, values); return object ? statement.all(object) : statement.all(...values); }
function queryOne(sqlite, sql, values = []) { return getStatement(sqlite.prepare(sql), sql, values) || null; }
function queryAll(sqlite, sql, values = []) { return allStatement(sqlite.prepare(sql), sql, values); }
async function withoutConsoleError(fn) { const original = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = original; } }
function check(name, condition, detail = "") { const ok = Boolean(condition); results.push({ name, ok }); console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`); if (!ok && detail) console.error(detail); }

await main();
