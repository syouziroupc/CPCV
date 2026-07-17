import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";
import { createToken, hashToken } from "../src/auth/passwords.js";
import { projectionMatches } from "../src/db/live-session-projection.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const ORIGIN = "http://localhost";
const results = [];

async function main() {
  await runGroup("legacy boundary", testLegacyBoundary);
  await runGroup("session projection and public compatibility", testCreateProjectionAndPublic);
  await runGroup("authorization and settings", testAuthorizationAndSettings);
  await runGroup("create compensation", testCreateCompensation);
  await runGroup("create compensation audit fallback", testCreateCompensationAuditFallback);
  await runGroup("update rollback", testUpdateRollback);
  await runGroup("rollback failure detection", testRollbackFailureDetection);
  await runGroup("safe-side end and delete", testSafeSideStop);
  await runGroup("comment room and websocket", testCommentRoomAndWebSocket);

  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 3-C integration test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function runGroup(name, fn) {
  const harness = await createHarness();
  try {
    await fn(harness);
  } catch (error) {
    check(`${name}: unexpected group error`, false, error);
  } finally {
    await harness.flush();
    harness.close();
  }
}

async function testLegacyBoundary(h) {
  let response = await h.api("/api/teacher/login", {
    method: "POST",
    body: { loginId: "teacher.a", password: "irrelevant-password" }
  });
  check("V2 flag disables legacy teacher login with 410", response.status === 410 && (await response.json()).error === "LEGACY_AUTH_DISABLED");

  response = await h.api("/api/master/status");
  check("V2 flag disables all legacy master APIs with 410", response.status === 410 && (await response.json()).error === "LEGACY_AUTH_DISABLED");

  response = await h.api("/api/private/me", {
    headers: { authorization: "Bearer obsolete-token" }
  });
  check("Bearer token cannot authenticate V2 private API", response.status === 401 && (await response.json()).error === "AUTH_REQUIRED");

  response = await h.api("/api/private/me", { actor: "teacherA" });
  const me = await response.json();
  check("HttpOnly-cookie session authenticates private API", response.status === 200 && me.teacher.id === "usr_teacher_a" && me.organization.id === "org_a");

  response = await h.api("/api/private/sessions?organizationId=org_b", { actor: "teacherA" });
  check("private API rejects organization selector query", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");

  const productionEnv = { ...h.env, AUTH_V2_ENABLED: "0", APP_ENV: "production" };
  response = await rawApi(productionEnv, "/api/private/me", { actor: h.actors.teacherA });
  check("production refuses AUTH_V2_ENABLED=0", response.status === 500 && (await response.json()).error === "INTERNAL_ERROR");
}

async function testCreateProjectionAndPublic(h) {
  const response = await h.api("/api/private/sessions", {
    actor: "teacherA",
    method: "POST",
    body: { title: "Stage 3-C class" }
  });
  const body = await response.json();
  check("teacher creates a session", response.status === 201 && body.sessionId && body.publicCode, body);

  const v2 = h.v2Row("SELECT * FROM live_sessions WHERE id=?1", body.sessionId);
  const legacy = h.legacyRow("SELECT * FROM sessions WHERE id=?1", body.sessionId);
  check("DB_V2 and legacy DB use identical session identity", projectionMatches(v2, legacy));
  check("legacy teacher projection uses V2 user id", legacy.teacher_id === "usr_teacher_a");
  check("session creation audit is recorded", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.created'", body.sessionId)?.action === "session.created");

  let publicResponse = await h.api(`/api/public/sessions/${body.publicCode}`);
  const publicBody = await publicResponse.json();
  check("student public session API reads the V2 source of truth", publicResponse.status === 200 && publicBody.title === "Stage 3-C class" && publicBody.postingEnabled === true);

  publicResponse = await h.api(`/api/public/sessions/${body.publicCode}/messages`, {
    method: "POST",
    body: { clientId: "client-test", nickname: "student", message: "hello" }
  });
  check("legacy student message shape remains accepted", publicResponse.status === 200 && (await publicResponse.json()).ok === true);
  check("public message reaches the verified comment room path", h.room.calls.some((call) => call.path === "/message" && call.body?.message === "hello"));

  const listResponse = await h.api("/api/private/sessions", { actor: "teacherA" });
  const list = await listResponse.json();
  check("teacher sees the created own session", listResponse.status === 200 && list.sessions.some((item) => item.id === body.sessionId));

  const adminResponse = await h.api("/api/private/sessions", { actor: "adminA" });
  const adminList = await adminResponse.json();
  check("Admin sees all organization sessions", adminResponse.status === 200 && adminList.sessions.some((item) => item.id === body.sessionId));
}

async function testAuthorizationAndSettings(h) {
  const created = await createSession(h, "teacherA", "Authorization class");

  let response = await h.api(`/api/private/sessions/${created.sessionId}`, { actor: "teacherB" });
  check("Teacher cannot read another teacher session", response.status === 404);

  response = await h.api(`/api/private/sessions/${created.sessionId}`, { actor: "ownerB" });
  check("other organization cannot read session by id", response.status === 404);

  response = await h.api(`/api/private/sessions/${created.sessionId}/settings`, {
    actor: "teacherB",
    method: "POST",
    body: { postingEnabled: false }
  });
  check("Teacher cannot update another teacher session", response.status === 404);

  response = await h.api(`/api/private/sessions/${created.sessionId}/settings`, {
    actor: "adminA",
    method: "POST",
    body: {
      postingEnabled: false,
      commentsVisible: true,
      commentDisplaySeconds: 30,
      commentDisplayMode: "scroll"
    }
  });
  const updated = await response.json();
  check("Admin updates a session in the same organization", response.status === 200 && updated.postingEnabled === false && updated.commentDisplayMode === "scroll");
  await h.flush();

  const v2 = h.v2Row("SELECT * FROM live_sessions WHERE id=?1", created.sessionId);
  const legacy = h.legacyRow("SELECT * FROM sessions WHERE id=?1", created.sessionId);
  check("settings update remains identical in both databases", projectionMatches(v2, legacy));
  check("settings update reaches comment room state", h.room.calls.some((call) => call.path === "/settings" && call.body?.commentDisplayMode === "scroll"));

  response = await h.api(`/api/private/sessions/${created.sessionId}/settings`, {
    actor: "teacherA",
    method: "POST",
    body: { organizationId: "org_b", postingEnabled: true }
  });
  check("settings body cannot select another organization", response.status === 400 && (await response.json()).error === "ORGANIZATION_ID_NOT_ALLOWED");
}

async function testCreateCompensation(h) {
  h.legacyExec(`CREATE TRIGGER fail_projection_create BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'forced legacy insert failure'); END;`);
  const response = await h.api("/api/private/sessions", {
    actor: "teacherA",
    method: "POST",
    body: { title: "Projection failure" }
  });
  check("legacy projection failure never returns success", response.status === 500);
  const failed = h.v2Row("SELECT * FROM live_sessions WHERE title='Projection failure' ORDER BY created_at DESC LIMIT 1");
  check("failed create is compensated to deleted in DB_V2", failed?.status === "deleted" && failed.posting_enabled === 0 && failed.comments_visible === 0 && failed.deleted_at);
  check("failed create records projection audit", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.projection_failed'", failed.id)?.action === "session.projection_failed");
  check("failed create leaves no legacy session", h.legacyRow("SELECT id FROM sessions WHERE id=?1", failed.id) === null);
}

async function testCreateCompensationAuditFallback(h) {
  h.legacyExec(`CREATE TRIGGER fail_projection_create_fallback BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT, 'forced legacy insert failure'); END;`);
  h.v2Exec(`CREATE TRIGGER fail_projection_failure_audit BEFORE INSERT ON audit_logs WHEN NEW.action='session.projection_failed' BEGIN SELECT RAISE(ABORT, 'forced compensation audit failure'); END;`);
  const response = await h.api("/api/private/sessions", {
    actor: "teacherA",
    method: "POST",
    body: { title: "Compensation audit failure" }
  });
  check("compensation audit failure never returns success", response.status === 500);
  const failed = h.v2Row("SELECT * FROM live_sessions WHERE title='Compensation audit failure' ORDER BY created_at DESC LIMIT 1");
  check("audit failure fallback still deletes the orphan V2 session", failed?.status === "deleted" && failed.posting_enabled === 0 && failed.comments_visible === 0 && failed.deleted_at);
  check("audit failure fallback leaves no legacy session", h.legacyRow("SELECT id FROM sessions WHERE id=?1", failed.id) === null);
  check("audit failure fallback records projection inconsistency", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.projection_inconsistent'", failed.id)?.action === "session.projection_inconsistent");
}

async function testUpdateRollback(h) {
  const created = await createSession(h, "teacherA", "Rollback class");
  h.v2Exec(`CREATE TRIGGER fail_updated_audit BEFORE INSERT ON audit_logs WHEN NEW.action='session.updated' BEGIN SELECT RAISE(ABORT, 'forced v2 audit failure'); END;`);
  const response = await h.api(`/api/private/sessions/${created.sessionId}/settings`, {
    actor: "teacherA",
    method: "POST",
    body: { postingEnabled: false }
  });
  check("V2 settings failure returns an error", response.status === 500);
  check("legacy settings are rolled back after V2 failure", h.legacyRow("SELECT posting_enabled FROM sessions WHERE id=?1", created.sessionId).posting_enabled === 1);
  check("V2 settings remain unchanged after atomic batch failure", h.v2Row("SELECT posting_enabled FROM live_sessions WHERE id=?1", created.sessionId).posting_enabled === 1);
}

async function testRollbackFailureDetection(h) {
  const created = await createSession(h, "teacherA", "Rollback failure class");
  h.v2Exec(`CREATE TRIGGER fail_updated_audit_2 BEFORE INSERT ON audit_logs WHEN NEW.action='session.updated' BEGIN SELECT RAISE(ABORT, 'forced v2 audit failure'); END;`);
  h.legacyExec(`CREATE TRIGGER fail_projection_restore BEFORE UPDATE ON sessions WHEN OLD.posting_enabled=0 AND NEW.posting_enabled=1 BEGIN SELECT RAISE(ABORT, 'forced rollback failure'); END;`);
  const response = await h.api(`/api/private/sessions/${created.sessionId}/settings`, {
    actor: "teacherA",
    method: "POST",
    body: { postingEnabled: false }
  });
  check("rollback failure returns generic 500", response.status === 500 && (await response.json()).error === "INTERNAL_ERROR");
  check("failed rollback is left visible as safe-side legacy state", h.legacyRow("SELECT posting_enabled FROM sessions WHERE id=?1", created.sessionId).posting_enabled === 0);
  check("rollback failure records projection inconsistency", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.projection_inconsistent'", created.sessionId)?.action === "session.projection_inconsistent");
}

async function testSafeSideStop(h) {
  const endCreated = await createSession(h, "teacherA", "End safety class");
  h.v2Exec(`CREATE TRIGGER fail_end_audit BEFORE INSERT ON audit_logs WHEN NEW.action='session.ended' BEGIN SELECT RAISE(ABORT, 'forced end failure'); END;`);
  let response = await h.api(`/api/private/sessions/${endCreated.sessionId}/settings`, {
    actor: "adminA",
    method: "POST",
    body: { status: "ended" }
  });
  check("V2 end failure returns error", response.status === 500);
  const legacyEnded = h.legacyRow("SELECT status, posting_enabled, comments_visible FROM sessions WHERE id=?1", endCreated.sessionId);
  check("end failure keeps legacy projection safely stopped", legacyEnded.status === "ended" && legacyEnded.posting_enabled === 0 && legacyEnded.comments_visible === 0);
  check("end failure does not falsely end DB_V2", h.v2Row("SELECT status FROM live_sessions WHERE id=?1", endCreated.sessionId).status === "active");
  check("end failure records projection inconsistency", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.projection_inconsistent'", endCreated.sessionId)?.action === "session.projection_inconsistent");

  h.v2Exec("DROP TRIGGER fail_end_audit;");
  const deleteCreated = await createSession(h, "teacherA", "Delete safety class");
  h.v2Exec(`CREATE TRIGGER fail_delete_audit BEFORE INSERT ON audit_logs WHEN NEW.action='session.deleted' BEGIN SELECT RAISE(ABORT, 'forced delete failure'); END;`);
  response = await h.api(`/api/private/sessions/${deleteCreated.sessionId}`, {
    actor: "adminA",
    method: "DELETE",
    body: {}
  });
  check("V2 delete failure returns error", response.status === 500);
  const legacyDeleted = h.legacyRow("SELECT status, posting_enabled, comments_visible FROM sessions WHERE id=?1", deleteCreated.sessionId);
  check("delete failure keeps legacy projection safely deleted", legacyDeleted.status === "deleted" && legacyDeleted.posting_enabled === 0 && legacyDeleted.comments_visible === 0);
  check("delete failure records projection inconsistency", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='session.projection_inconsistent'", deleteCreated.sessionId)?.action === "session.projection_inconsistent");
}

async function testCommentRoomAndWebSocket(h) {
  const created = await createSession(h, "teacherA", "Room class");
  let response = await h.api(`/api/private/sessions/${created.sessionId}/comments/clear`, {
    actor: "teacherA",
    method: "POST",
    body: {}
  });
  check("authenticated clear operation succeeds", response.status === 200 && (await response.json()).ok === true);
  check("clear reaches unchanged comment room endpoint", h.room.calls.some((call) => call.path === "/clear"));
  check("clear operation is audited", h.v2Row("SELECT action FROM audit_logs WHERE target_id=?1 AND action='comments.cleared'", created.sessionId)?.action === "comments.cleared");

  const ticketResponse = await h.api(`/api/private/sessions/${created.sessionId}/live-ticket`, {
    actor: "teacherA",
    method: "POST",
    body: { lastSequence: 0 }
  });
  const ticketBody = await ticketResponse.json();
  check("authenticated viewer receives a one-time live ticket", ticketResponse.status === 200 && typeof ticketBody.ticket === "string");
  response = await h.api(`/api/private/sessions/${created.sessionId}/live?ticket=${encodeURIComponent(ticketBody.ticket)}`, {
    actor: "teacherA",
    headers: { Upgrade: "websocket", "Sec-WebSocket-Protocol": "teacher-token.obsolete-secret" }
  });
  const liveCall = h.room.calls.find((call) => call.path === "/connect");
  check("ticket-authenticated WebSocket bridge reaches comment room", response.status === 200 && liveCall?.headers.get("x-realtime-ticket-consumed") === "true", { status: response.status, headers: liveCall ? Object.fromEntries(liveCall.headers) : null });
  check("V2 WebSocket bridge strips obsolete token subprotocol", !liveCall?.headers.get("sec-websocket-protocol"));

  response = await h.api(`/api/private/sessions/${created.sessionId}/live?ticket=${encodeURIComponent(ticketBody.ticket)}`, {
    actor: "teacherA",
    origin: "https://evil.example",
    headers: { Upgrade: "websocket" }
  });
  check("cross-origin WebSocket request is rejected", response.status === 403 && (await response.json()).error === "ORIGIN_FORBIDDEN");
}

async function createSession(h, actor, title) {
  const response = await h.api("/api/private/sessions", { actor, method: "POST", body: { title } });
  const body = await response.json();
  if (response.status !== 201) throw new Error(`create session failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

async function createHarness() {
  const v2Sqlite = new DatabaseSync(":memory:");
  const legacySqlite = new DatabaseSync(":memory:");
  v2Sqlite.exec("PRAGMA foreign_keys = ON;");
  legacySqlite.exec("PRAGMA foreign_keys = ON;");
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
  ]) {
    v2Sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  }
  legacySqlite.exec(LEGACY_SCHEMA);

  const DB_V2 = new D1DatabaseAdapter(v2Sqlite);
  const DB = new D1DatabaseAdapter(legacySqlite);
  const room = new CommentRoomNamespaceMock();
  const pending = [];
  const env = {
    DB_V2,
    DB,
    COMMENT_ROOM: room,
    APP_ENV: "local",
    AUTH_V2_ENABLED: "1",
    AUTH_ORIGIN: ORIGIN,
    PUBLIC_ORIGIN: ORIGIN
  };
  const actors = await seed(v2Sqlite);
  const h = {
    env,
    actors,
    room,
    api: (path, options = {}) => rawApi(env, path, { ...options, actor: typeof options.actor === "string" ? actors[options.actor] : options.actor }, pending),
    v2Row: (sql, ...values) => queryOne(v2Sqlite, sql, values),
    legacyRow: (sql, ...values) => queryOne(legacySqlite, sql, values),
    v2Exec: (sql) => v2Sqlite.exec(sql),
    legacyExec: (sql) => legacySqlite.exec(sql),
    flush: async () => {
      while (pending.length) await Promise.allSettled(pending.splice(0));
    },
    close: () => {
      v2Sqlite.close();
      legacySqlite.close();
    }
  };
  return h;
}

async function seed(sqlite) {
  const now = new Date();
  const createdAt = new Date(now.getTime() - 60_000).toISOString();
  const idleExpiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const absoluteExpiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  sqlite.exec(`
    INSERT INTO organizations VALUES
      ('org_a','Organization A','active','${createdAt}','${createdAt}',NULL),
      ('org_b','Organization B','active','${createdAt}','${createdAt}',NULL);
  `);
  const users = [
    ["usr_owner_a", "owner.a", "Owner A"],
    ["usr_admin_a", "admin.a", "Admin A"],
    ["usr_teacher_a", "teacher.a", "Teacher A"],
    ["usr_teacher_b", "teacher.b", "Teacher B"],
    ["usr_owner_b", "owner.b", "Owner B"]
  ];
  const insertUser = sqlite.prepare(`
    INSERT INTO users (
      id, login_id, display_name, password_scheme, password_hash, password_salt,
      password_changed_at, status, created_at, updated_at, deleted_at,
      failed_login_count, locked_until, require_password_change
    ) VALUES (?1,?2,?3,'test-scheme','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA','BBBBBBBBBBBBBBBB',?4,'active',?4,?4,NULL,0,NULL,0)
  `);
  for (const [id, loginId, displayName] of users) runStatement(insertUser, [id, loginId, displayName, createdAt]);

  const memberships = [
    ["org_a", "usr_owner_a", "owner"],
    ["org_a", "usr_admin_a", "admin"],
    ["org_a", "usr_teacher_a", "teacher"],
    ["org_a", "usr_teacher_b", "teacher"],
    ["org_b", "usr_owner_b", "owner"]
  ];
  const insertMember = sqlite.prepare(`INSERT INTO organization_members VALUES (?1,?2,?3,'active',?4,?4,NULL)`);
  for (const [org, user, role] of memberships) runStatement(insertMember, [org, user, role, createdAt]);

  const actors = {};
  for (const [key, org, user] of [
    ["ownerA", "org_a", "usr_owner_a"],
    ["adminA", "org_a", "usr_admin_a"],
    ["teacherA", "org_a", "usr_teacher_a"],
    ["teacherB", "org_a", "usr_teacher_b"],
    ["ownerB", "org_b", "usr_owner_b"]
  ]) {
    const rawToken = createToken();
    const rawCsrf = createToken();
    const sessionId = `ses_${key}`;
    const authInsert = sqlite.prepare(`
      INSERT INTO auth_sessions VALUES (?1,?2,?3,?4,?5,?6,?6,?7,?8,NULL)
    `);
    runStatement(authInsert, [
      sessionId,
      org,
      user,
      await hashToken(rawToken),
      await hashToken(rawCsrf),
      createdAt,
      idleExpiresAt,
      absoluteExpiresAt
    ], authInsert.sourceSQL);
    actors[key] = {
      cookie: `cpcv_session_dev=${encodeURIComponent(rawToken)}`,
      csrf: rawCsrf
    };
  }
  return actors;
}

async function rawApi(env, path, options = {}, pending = []) {
  const actor = options.actor || null;
  const headers = new Headers(options.headers || {});
  if (!options.omitOrigin) headers.set("origin", Object.hasOwn(options, "origin") ? options.origin : ORIGIN);
  headers.set("cf-connecting-ip", "127.0.0.1");
  if (actor?.cookie) headers.set("cookie", actor.cookie);
  if (actor?.csrf) headers.set("x-csrf-token", actor.csrf);
  let body;
  if (Object.hasOwn(options, "body")) {
    headers.set("content-type", headers.get("content-type") || "application/json");
    body = JSON.stringify(options.body);
  }
  const request = new Request(`${ORIGIN}${path}`, {
    method: options.method || "GET",
    headers,
    body
  });
  return withoutConsoleError(() => worker.fetch(request, env, {
    waitUntil(promise) { pending.push(Promise.resolve(promise)); }
  }));
}

class CommentRoomNamespaceMock {
  constructor() {
    this.calls = [];
  }
  idFromName(name) { return String(name); }
  get(id) {
    return {
      fetch: async (input, init = {}) => {
        const request = input instanceof Request ? input : new Request(String(input), init);
        const path = new URL(request.url).pathname;
        let body = null;
        if (request.method !== "GET") {
          try { body = await request.clone().json(); } catch { body = null; }
        }
        this.calls.push({ id, path, method: request.method, headers: new Headers(request.headers), body });
        if (path === "/message") return jsonResponse({ ok: true });
        if (path === "/settings") return jsonResponse({ ok: true });
        if (path === "/clear") return jsonResponse({ ok: true });
        if (path === "/connect") return new Response("mock websocket bridge", { status: 200 });
        return jsonResponse({ ok: false }, 404);
      }
    };
  }
}

class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE;");
    try {
      const output = [];
      for (const statement of statements) output.push(statement.executeRun());
      this.sqlite.exec("COMMIT;");
      return output;
    } catch (error) {
      this.sqlite.exec("ROLLBACK;");
      throw error;
    }
  }
  async exec(sql) {
    this.sqlite.exec(sql);
    return { count: 0, duration: 0 };
  }
}

class D1PreparedAdapter {
  constructor(sqlite, sql, values = []) {
    this.sqlite = sqlite;
    this.sql = sql;
    this.values = values;
  }
  bind(...values) { return new D1PreparedAdapter(this.sqlite, this.sql, values); }
  async first(column) {
    const row = this.executeGet();
    return column ? row?.[column] ?? null : row ?? null;
  }
  async all() { return { success: true, results: this.executeAll(), meta: {} }; }
  async run() { return this.executeRun(); }
  executeGet() { return getStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeAll() { return allStatement(this.sqlite.prepare(this.sql), this.sql, this.values); }
  executeRun() {
    const result = runStatement(this.sqlite.prepare(this.sql), this.values, this.sql);
    return { success: true, results: [], meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

function parameterObject(sql, values) {
  const matches = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
  if (!matches.length) return null;
  const object = {};
  for (const index of new Set(matches)) object[String(index)] = values[index - 1] ?? null;
  return object;
}

function runStatement(statement, values, sql = statement.sourceSQL || "") {
  const object = parameterObject(sql, values);
  return object ? statement.run(object) : statement.run(...values);
}
function getStatement(statement, sql, values) {
  const object = parameterObject(sql, values);
  return object ? statement.get(object) : statement.get(...values);
}
function allStatement(statement, sql, values) {
  const object = parameterObject(sql, values);
  return object ? statement.all(object) : statement.all(...values);
}
function queryOne(sqlite, sql, values = []) {
  return getStatement(sqlite.prepare(sql), sql, values) || null;
}

async function withoutConsoleError(fn) {
  const original = console.error;
  console.error = () => {};
  try { return await fn(); } finally { console.error = original; }
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

const LEGACY_SCHEMA = `
CREATE TABLE teachers (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  public_code TEXT NOT NULL UNIQUE,
  teacher_id TEXT NOT NULL,
  title TEXT NOT NULL,
  posting_enabled INTEGER NOT NULL DEFAULT 1,
  comments_visible INTEGER NOT NULL DEFAULT 1,
  comment_display_seconds INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  ended_at TEXT,
  comment_display_mode TEXT NOT NULL DEFAULT 'stack3',
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);
CREATE TABLE admin_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT NOT NULL,
  session_id TEXT,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE teacher_accounts (
  id TEXT PRIMARY KEY,
  login_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  disabled_at TEXT
);
CREATE TABLE teacher_sessions (
  id TEXT PRIMARY KEY,
  teacher_account_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE TABLE master_sessions (
  id TEXT PRIMARY KEY,
  session_token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
`;

await main();
