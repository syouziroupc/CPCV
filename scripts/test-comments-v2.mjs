import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker, { CommentRoom } from "../src/index.js";
import { createToken, hashToken } from "../src/auth/passwords.js";
import { buildCommentsCsv, csvCell } from "../src/comments/csv.js";
import { persistComment, runCommentRetention } from "../src/comments/repository.js";
import { normalizeCommentInput } from "../src/comments/validation.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const results = [];


async function main() {
  await runGroup("schema", testSchema);
  await runGroup("public persistence and idempotency", testPublicPersistence);
  await runGroup("validation and privacy", testValidationAndPrivacy);
  await runGroup("authorization history and export", testHistoryAndExport);
  await runGroup("retention", testRetention);
  await runGroup("bounded maintenance", testBoundedMaintenance);
  await runGroup("fault rollback", testFaultRollback);
  await runGroup("scheduled retention", testScheduledRetention);
  testStaticClientBoundary();

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 4 comment persistence test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function runGroup(name, fn) {
  const h = await createHarness();
  try {
    await fn(h);
  } catch (error) {
    check(`${name}: unexpected group error`, false, error);
  } finally {
    h.close();
  }
}

async function testSchema(h) {
  const tables = h.rows("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('participants','comments','comment_events') ORDER BY name").map((row) => row.name);
  check("Stage 4 creates three comment tables", JSON.stringify(tables) === JSON.stringify(["comment_events", "comments", "participants"]), tables);
  const indexes = h.rows("SELECT name FROM sqlite_schema WHERE type='index' AND name LIKE 'idx_comment%' ORDER BY name").map((row) => row.name);
  check("comment indexes exist", indexes.includes("idx_comments_session_created") && indexes.includes("idx_comments_retention") && indexes.includes("idx_comment_events_session_created"), indexes);
  check("live session organization composite unique index exists", Boolean(h.row("SELECT name FROM sqlite_schema WHERE type='index' AND name='uq_live_sessions_organization_id'")));
  check("foreign key check is clean after migration", h.rows("PRAGMA foreign_key_check").length === 0);
  check("quick check is ok", h.row("PRAGMA quick_check")?.quick_check === "ok");
  const triggers = h.rows("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'trg_comments_content_guard_%' ORDER BY name").map((row) => row.name);
  check("database comment content guards exist", JSON.stringify(triggers) === JSON.stringify(["trg_comments_content_guard_insert", "trg_comments_content_guard_update"]), triggers);
  h.exec(`INSERT INTO participants VALUES ('part_guard','org_a','sess_stage4','guard_token_hash','active',NULL,'2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z',NULL)`);
  await expectSqlFailure("database rejects an overlong comment", () => h.exec(`INSERT INTO comments (id,organization_id,live_session_id,participant_id,idempotency_key,nickname,message,message_length,moderation_state,created_at,updated_at,retained_until,deleted_at) VALUES ('cmt_guard_1','org_a','sess_stage4','part_guard','guard_key_00000001','n','${"x".repeat(141)}',141,'visible','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z',NULL)`));
  await expectSqlFailure("database rejects a mismatched message length", () => h.exec(`INSERT INTO comments (id,organization_id,live_session_id,participant_id,idempotency_key,nickname,message,message_length,moderation_state,created_at,updated_at,retained_until,deleted_at) VALUES ('cmt_guard_2','org_a','sess_stage4','part_guard','guard_key_00000002','n','hello',4,'visible','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z',NULL)`));
  await expectSqlFailure("database rejects an overlong nickname", () => h.exec(`INSERT INTO comments (id,organization_id,live_session_id,participant_id,idempotency_key,nickname,message,message_length,moderation_state,created_at,updated_at,retained_until,deleted_at) VALUES ('cmt_guard_3','org_a','sess_stage4','part_guard','guard_key_00000003','${"n".repeat(21)}','hello',5,'visible','2000-01-01T00:00:00.000Z','2000-01-01T00:00:00.000Z','2030-01-01T00:00:00.000Z',NULL)`));
}

async function testPublicPersistence(h) {
  let response = await h.api(`/api/public/sessions/${h.publicCode}`);
  const sessionBody = await response.json();
  const setCookie = response.headers.get("set-cookie") || "";
  check("public session GET succeeds", response.status === 200 && sessionBody.postingEnabled === true);
  check("participant cookie is HttpOnly and session-scoped", /cpcv_p_[a-z0-9]+=/.test(setCookie) && /HttpOnly/i.test(setCookie) && setCookie.includes(`/api/public/sessions/${h.publicCode}`), setCookie);
  check("GET does not create participant row", h.count("participants") === 0);

  const cookie = setCookie.split(";")[0];
  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    rawBody: JSON.stringify({ message: "x".repeat(5000), idempotencyKey: "oversize_key_0001" })
  });
  check("public comment JSON body is capped", response.status === 413 && (await response.json()).error === "REQUEST_BODY_TOO_LARGE");

  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: " student ", message: "hello\n  world", idempotencyKey: "post_key_00000001" }
  });
  const created = await response.json();
  check("new public comment returns 201", response.status === 201 && created.ok && created.commentId && created.duplicate === false, created);
  check("participant is persisted once", h.count("participants") === 1);
  check("comment is persisted once", h.count("comments") === 1);
  check("created event is persisted atomically", h.count("comment_events") === 1);
  const row = h.row("SELECT * FROM comments WHERE id=?1", created.commentId);
  check("stored comment uses normalized content", row.nickname === "student" && row.message === "hello world" && row.message_length === 11, row);
  check("stored comment belongs to session organization", row.organization_id === "org_a" && row.live_session_id === h.sessionId);
  check("comment response uses persistent id", created.comment.id === row.id && created.comment.createdAt === row.created_at);
  check("new comment is broadcast with persistent id", h.rooms.broadcasts.some((payload) => payload.id === row.id && payload.type === "message:new"));

  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: "changed", message: "different text", idempotencyKey: "post_key_00000001" }
  });
  const duplicate = await response.json();
  check("same idempotency key returns existing comment", response.status === 200 && duplicate.duplicate === true && duplicate.commentId === row.id);
  check("duplicate does not add database rows", h.count("comments") === 1 && h.count("comment_events") === 1);
  check("duplicate is not broadcast again", h.rooms.broadcasts.filter((payload) => payload.id === row.id).length === 1);

  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: "student", message: "second", idempotencyKey: "post_key_00000002" }
  });
  check("different immediate post is rate limited", response.status === 429 && (await response.json()).error === "RATE_LIMITED");
  check("rate-limited post is not persisted", h.count("comments") === 1);

  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: "legacy", message: "legacy client" }
  });
  check("legacy client without idempotency key remains accepted after rate window is reset", response.status === 429);
  h.exec("UPDATE participants SET next_post_at=created_at");
  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    body: { nickname: "legacy", message: "legacy client" }
  });
  check("legacy missing key receives compatibility key", response.status === 201 && (await response.json()).ok === true);
}

async function testValidationAndPrivacy(h) {
  const normalized = normalizeCommentInput({ nickname: "Ａ\u200B", message: "Ｈｅｌｌｏ\tworld", idempotencyKey: "valid_key_0000001" });
  check("NFKC and control normalization is applied", normalized.nickname === "A" && normalized.message === "Hello world");
  await expectAuthCode("URL is rejected", () => normalizeCommentInput({ message: "www.example.com", idempotencyKey: "valid_key_0000002" }), "URL_NOT_ALLOWED");
  await expectAuthCode("invalid idempotency key is rejected", () => normalizeCommentInput({ message: "hello", idempotencyKey: "bad key" }), "IDEMPOTENCY_KEY_INVALID");
  await expectAuthCode("overlong message is rejected", () => normalizeCommentInput({ message: "あ".repeat(141), idempotencyKey: "valid_key_0000003" }), "MESSAGE_TOO_LONG");

  const directRoom = h.rooms.raw(h.sessionId);
  let response = await directRoom.fetch(new Request("https://comment-room/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({})
  }));
  check("direct unverified Durable Object post is rejected", response.status === 401 && (await response.json()).error === "COMMENT_VERIFICATION_REQUIRED");

  response = await h.api(`/api/public/sessions/${h.publicCode}`);
  const cookie = response.headers.get("set-cookie").split(";")[0];
  response = await h.api(`/api/public/sessions/${h.publicCode}/messages`, {
    method: "POST",
    cookie,
    headers: { "cf-connecting-ip": "203.0.113.10", "user-agent": "tracking-agent" },
    body: { nickname: "n", message: "privacy", idempotencyKey: "privacy_key_00001" }
  });
  check("privacy test comment is stored", response.status === 201);
  const commentColumns = h.rows("PRAGMA table_info(comments)").map((row) => row.name);
  const participantColumns = h.rows("PRAGMA table_info(participants)").map((row) => row.name);
  check("schema has no IP or user-agent columns", ![...commentColumns, ...participantColumns].some((name) => /^(ip|ip_address|user_agent|fingerprint)$/i.test(name)));
  const broadcast = h.rooms.broadcasts.at(-1);
  check("broadcast payload contains no IP or participant token", !Object.hasOwn(broadcast, "ipAddress") && !Object.hasOwn(broadcast, "participantId") && !Object.hasOwn(broadcast, "participantTokenHash"), broadcast);
}

async function testHistoryAndExport(h) {
  await insertComment(h, "hist_key_00000001", "=SUM(1,1)", "@nickname", "2000-01-01T00:00:00.000Z");
  h.exec("UPDATE participants SET next_post_at='2000-01-01T00:00:00.000Z'");
  await insertComment(h, "hist_key_00000002", "normal", "student", "2000-01-01T00:00:10.000Z");

  let response = await h.api(`/api/private/sessions/${h.sessionId}/comments?limit=1`, { actor: "teacherA" });
  let body = await response.json();
  check("session owner teacher reads comment history", response.status === 200 && body.comments.length === 1 && body.nextCursor);
  const firstId = body.comments[0].id;
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments?limit=1&cursor=${encodeURIComponent(body.nextCursor)}`, { actor: "teacherA" });
  body = await response.json();
  check("comment history cursor paginates without duplicate", response.status === 200 && body.comments.length === 1 && body.comments[0].id !== firstId);

  response = await h.api(`/api/private/sessions/${h.sessionId}/comments`, { actor: "adminA" });
  check("same organization Admin reads history", response.status === 200 && (await response.json()).comments.length === 2);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments`, { actor: "teacherB" });
  check("another Teacher cannot read history", response.status === 404);
  response = await h.api(`/api/private/sessions/${h.sessionId}/comments`, { actor: "ownerB" });
  check("other organization cannot read history", response.status === 404);

  response = await h.api(`/api/private/sessions/${h.sessionId}/comments/export`, { actor: "teacherA" });
  const csv = await response.text();
  check("CSV export succeeds with attachment headers", response.status === 200 && /text\/csv/.test(response.headers.get("content-type")) && /attachment/.test(response.headers.get("content-disposition")));
  check("CSV formula injection is neutralized", csv.includes("\"'=SUM(1,1)\"") && csv.includes("\"'@nickname\""), csv);
  check("CSV does not contain IP address column", !csv.includes("IPアドレス"));
  check("csvCell neutralizes leading whitespace formula", csvCell("  +1") === '"\'  +1"');
  check("buildCommentsCsv quotes embedded double quote", buildCommentsCsv({ id: "s", title: 'A"B' }, [{ id: "c", nickname: "", message: 'x"y', moderationState: "visible", createdAt: "t" }]).includes('"x""y"'));
}

async function testRetention(h) {
  const first = await persistComment(h.env.DB_V2, {
    organizationId: "org_a",
    liveSessionId: h.sessionId,
    participantTokenHash: await hashToken("retention-token-a"),
    retentionDays: 1,
    nickname: "old",
    message: "expired",
    messageLength: 7,
    idempotencyKey: "retention_key_001",
    now: "2026-01-01T00:00:00.000Z"
  });
  const second = await persistComment(h.env.DB_V2, {
    organizationId: "org_a",
    liveSessionId: h.sessionId,
    participantTokenHash: await hashToken("retention-token-b"),
    retentionDays: 30,
    nickname: "new",
    message: "retained",
    messageLength: 8,
    idempotencyKey: "retention_key_002",
    now: "2026-01-01T00:00:00.000Z"
  });
  check("retention fixtures inserted", first.comment.id && second.comment.id && h.count("comments") === 2);
  const result = await runCommentRetention(h.env.DB_V2, { now: "2026-01-03T00:00:00.000Z", limit: 500 });
  check("retention physically deletes only expired comments", result.commentsDeleted === 1 && h.row("SELECT id FROM comments WHERE id=?1", first.comment.id) === null && h.row("SELECT id FROM comments WHERE id=?1", second.comment.id));
  check("comment events cascade with deleted comment", h.row("SELECT id FROM comment_events WHERE comment_id=?1", first.comment.id) === null);
  check("orphan participant is deleted", result.participantsDeleted === 1 && h.count("participants") === 1);

  let response = await h.api("/api/private/maintenance/comment-retention", { actor: "adminA", method: "POST", body: {} });
  check("Admin cannot manually run retention", response.status === 403);
  response = await h.api("/api/private/maintenance/comment-retention", { actor: "ownerA", method: "POST", body: {} });
  check("Owner can run retention maintenance", response.status === 200 && (await response.json()).ok === true);
}

async function testBoundedMaintenance(h) {
  const values = [];
  for (let index = 0; index < 601; index += 1) {
    values.push(`('orphan_${index}', 'org_a', '${h.sessionId}', 'orphan_hash_${index}', 'active', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)`);
  }
  h.exec(`INSERT INTO participants (id, organization_id, live_session_id, token_hash, status, post_claim_id, next_post_at, created_at, last_seen_at, deleted_at) VALUES ${values.join(',')}`);
  const first = await runCommentRetention(h.env.DB_V2, { now: "2026-01-03T00:00:00.000Z", limit: 100 });
  check("participant retention obeys the batch limit", first.participantsDeleted === 100 && h.count("participants") === 501, first);

  const authSessionId = h.row("SELECT id FROM auth_sessions LIMIT 1")?.id;
  h.exec(`INSERT INTO auth_session_csrf_tokens (id, auth_session_id, token_hash, created_at, expires_at) VALUES ('expired_csrf', '${authSessionId}', 'expired_hash', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z')`);
  h.exec(`
    INSERT INTO auth_sessions VALUES
      ('ses_old_cleanup','org_a','usr_teacher_a','old_session_hash','old_session_csrf','2025-11-30T00:00:00.000Z','2025-12-01T00:00:00.000Z','2025-12-01T01:00:00.000Z','2025-12-02T00:00:00.000Z',NULL),
      ('ses_recent_cleanup','org_a','usr_teacher_a','recent_session_hash','recent_session_csrf','2025-12-31T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-01-01T01:00:00.000Z','2026-01-02T00:00:00.000Z',NULL);
    INSERT INTO auth_session_csrf_tokens VALUES ('old_session_secondary','ses_old_cleanup','old_secondary_hash','2025-12-01T00:00:00.000Z','2025-12-01T01:00:00.000Z');
    INSERT INTO password_reset_tokens VALUES
      ('rst_old_cleanup','usr_teacher_a','old_reset_hash','usr_owner_a','2025-11-30T00:00:00.000Z','2025-12-01T00:00:00.000Z',NULL,NULL,NULL,NULL),
      ('rst_recent_cleanup','usr_teacher_a','recent_reset_hash','usr_owner_a','2025-12-31T00:00:00.000Z','2026-01-02T00:00:00.000Z',NULL,NULL,NULL,NULL);
  `);
  const pending = [];
  await worker.scheduled({ scheduledTime: Date.parse("2026-01-03T00:00:00.000Z") }, h.env, { waitUntil(promise) { pending.push(Promise.resolve(promise)); } });
  await Promise.all(pending);
  check("scheduled maintenance drains participant backlog", h.count("participants") === 0);
  check("scheduled maintenance prunes expired secondary CSRF tokens", h.row("SELECT id FROM auth_session_csrf_tokens WHERE id='expired_csrf'") === null);
  check("scheduled maintenance removes old expired auth sessions", h.row("SELECT id FROM auth_sessions WHERE id='ses_old_cleanup'") === null && h.row("SELECT id FROM auth_sessions WHERE id='ses_recent_cleanup'"));
  check("auth session deletion cascades secondary CSRF rows", h.row("SELECT id FROM auth_session_csrf_tokens WHERE id='old_session_secondary'") === null);
  check("scheduled maintenance removes only old reset tokens", h.row("SELECT id FROM password_reset_tokens WHERE id='rst_old_cleanup'") === null && h.row("SELECT id FROM password_reset_tokens WHERE id='rst_recent_cleanup'"));
}

async function testFaultRollback(h) {
  h.exec(`CREATE TRIGGER fail_comment_event BEFORE INSERT ON comment_events BEGIN SELECT RAISE(ABORT, 'forced event failure'); END;`);
  const beforeParticipants = h.count("participants");
  let failed = false;
  try {
    await persistComment(h.env.DB_V2, {
      organizationId: "org_a",
      liveSessionId: h.sessionId,
      participantTokenHash: await hashToken("fault-token-0000000000000000000000000000"),
      retentionDays: 30,
      nickname: "fault",
      message: "must rollback",
      messageLength: 13,
      idempotencyKey: "fault_key_00000001",
      now: new Date().toISOString()
    });
  } catch { failed = true; }
  check("event insert fault rejects comment operation", failed);
  check("event fault rolls back participant and comment", h.count("comments") === 0 && h.count("participants") === beforeParticipants);
  h.exec("DROP TRIGGER fail_comment_event");
}

async function testScheduledRetention(h) {
  await persistComment(h.env.DB_V2, {
    organizationId: "org_a",
    liveSessionId: h.sessionId,
    participantTokenHash: await hashToken("scheduled-token-a"),
    retentionDays: 1,
    nickname: "old",
    message: "scheduled",
    messageLength: 9,
    idempotencyKey: "scheduled_key_001",
    now: "2026-01-01T00:00:00.000Z"
  });
  const pending = [];
  await worker.scheduled({ scheduledTime: Date.parse("2026-01-03T00:00:00.000Z") }, h.env, { waitUntil(promise) { pending.push(Promise.resolve(promise)); } });
  await Promise.all(pending);
  check("scheduled handler runs retention without remote services", h.count("comments") === 0 && h.count("participants") === 0);
}

function testStaticClientBoundary() {
  const join = readFileSync(resolve(ROOT, "public/assets/join.js"), "utf8");
  const viewer = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");
  check("join client no longer stores persistent client id in localStorage", !join.includes("cpcv_client_id") && !join.includes("x-client-id"));
  check("join client sends idempotency key", join.includes("idempotencyKey") && join.includes("crypto.randomUUID"));
  check("join client counts Unicode code points", join.includes("codePointLength(messageEl.value)") && join.includes("truncateCodePoints(nicknameEl.value, 20)"));
  const joinHtml = readFileSync(resolve(ROOT, "public", "_j_spa.html"), "utf8");
  check("join form avoids UTF-16 maxlength for Unicode limits", !joinHtml.includes('maxlength="140"') && !joinHtml.includes('maxlength="20"'));
  check("viewer CSV uses authenticated server export", viewer.includes("/comments/export") && !viewer.includes("IPアドレス"));
  check("viewer local cache no longer records IP", !viewer.includes("ipAddress:"));
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

async function expectSqlFailure(name, fn) {
  try { await fn(); check(name, false, "did not fail"); }
  catch (error) { check(name, /comment content constraint/i.test(String(error?.message || error)), error); }
}

async function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  const legacy = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  legacy.exec("PRAGMA foreign_keys=ON");
  for (const name of ["0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql", "0004_precision_hardening.sql", "0005_comment_content_guards.sql", "0006_manual_moderation.sql", "0007_realtime.sql", "0008_email_auth.sql", "0009_account_lifecycle.sql", "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql"]) {
    sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  }
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
  const seeded = await seed(sqlite);
  return {
    env,
    rooms,
    actors: seeded.actors,
    sessionId: seeded.sessionId,
    publicCode: seeded.publicCode,
    api: (path, options = {}) => rawApi(env, path, { ...options, actor: typeof options.actor === "string" ? seeded.actors[options.actor] : options.actor }),
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    exec: (sql) => sqlite.exec(sql),
    count: (table) => Number(queryOne(sqlite, `SELECT COUNT(*) AS count FROM ${table}`)?.count || 0),
    close: () => { sqlite.close(); legacy.close(); }
  };
}

async function seed(sqlite) {
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
    INSERT INTO live_sessions VALUES ('sess_stage4','org_a','usr_teacher_a','STG4AA','Stage 4 class',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${future}',NULL,NULL);
  `);
  const actors = {};
  for (const [key, org, user] of [["ownerA","org_a","usr_owner_a"],["adminA","org_a","usr_admin_a"],["teacherA","org_a","usr_teacher_a"],["teacherB","org_a","usr_teacher_b"],["ownerB","org_b","usr_owner_b"]]) {
    const token = createToken();
    const csrf = createToken();
    runStatement(sqlite.prepare("INSERT INTO auth_sessions VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8,NULL)"), [`ses_${key}`, org, user, await hashToken(token), await hashToken(csrf), createdAt, future, future]);
    actors[key] = { cookie: `cpcv_session_dev=${encodeURIComponent(token)}`, csrf };
  }
  return { actors, sessionId: "sess_stage4", publicCode: "STG4AA" };
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
    return {
      fetch(input, init = {}) {
        const request = input instanceof Request ? input : new Request(String(input), init);
        return room.fetch(request);
      }
    };
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
