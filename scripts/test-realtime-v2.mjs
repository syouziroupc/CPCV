import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createToken, hashToken } from "../src/auth/passwords.js";
import { persistComment } from "../src/comments/repository.js";
import { moderateComment } from "../src/moderation/repository.js";
import {
  appendRealtimeEvent,
  consumeConnectionTicket,
  findRealtimeEventForComment,
  getRealtimeSync,
  issueConnectionTicket,
  pruneRealtimeRecords
} from "../src/realtime/repository.js";
import { enforcePublicCommentEdgeLimit } from "../src/realtime/edge-rate-limit.js";
import { CommentRoom } from "../src/realtime/comment-room.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

async function main() {
  const h = createHarness();
  try {
    await testSchema(h);
    await testTickets(h);
    await testSequenceAndCatchUp(h);
    await testModerationEvents(h);
    await testSnapshotReset(h);
    await testPruning(h);
    await testEdgeLimiter();
    await testHibernationHandlers(h);
    testViewerClient();
  } finally {
    h.close();
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 6 realtime test summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function testSchema(h) {
  const tables = h.rows("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'realtime_%' ORDER BY name").map((row) => row.name);
  check("Stage 6 creates realtime tables", JSON.stringify(tables) === JSON.stringify([
    "realtime_connection_tickets", "realtime_events", "realtime_session_state"
  ]), tables);
  const triggers = h.rows("SELECT name FROM sqlite_schema WHERE type='trigger' AND name LIKE 'trg_realtime_%' ORDER BY name").map((row) => row.name);
  check("comment realtime triggers exist", triggers.includes("trg_realtime_comment_visible_insert") && triggers.includes("trg_realtime_comment_moderation_update"), triggers);
  check("realtime foreign keys are clean", h.rows("PRAGMA foreign_key_check").length === 0);
  check("realtime quick check is ok", h.row("PRAGMA quick_check")?.quick_check === "ok");
}

async function testTickets(h) {
  const token = createToken();
  const issued = await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(token), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 7, now: h.now
  });
  check("live ticket expires after sixty seconds", Date.parse(issued.expiresAt) === h.now + 60_000, issued);
  const consumed = await consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(token), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now + 1
  });
  check("live ticket preserves reconnect sequence", consumed.lastSequence === 7, consumed);
  await expectAuth("live ticket is one-time", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(token), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now + 2
  }), "REALTIME_TICKET_INVALID");

  const wrongToken = createToken();
  await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(wrongToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 0, now: h.now
  });
  await expectAuth("ticket cannot cross users", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(wrongToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_admin_a", now: h.now + 1
  }), "REALTIME_TICKET_INVALID");

  const expiredToken = createToken();
  await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(expiredToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 0, now: h.now - 120_000
  });
  await expectAuth("expired ticket is rejected", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(expiredToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now
  }), "REALTIME_TICKET_INVALID");

  const revokedToken = createToken();
  await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(revokedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 0, now: h.now
  });
  h.exec(`UPDATE auth_sessions SET revoked_at='${new Date(h.now + 1).toISOString()}' WHERE id='auth_stage6'`);
  await expectAuth("ticket consumption revalidates the auth session", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(revokedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now + 2
  }), "REALTIME_TICKET_INVALID");
  h.exec("UPDATE auth_sessions SET revoked_at=NULL WHERE id='auth_stage6'");

  const suspendedToken = createToken();
  await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(suspendedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 0, now: h.now
  });
  h.exec("UPDATE organization_members SET status='suspended' WHERE organization_id='org_a' AND user_id='usr_teacher_a'");
  await expectAuth("ticket consumption revalidates active membership", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(suspendedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now + 2
  }), "REALTIME_TICKET_INVALID");
  h.exec("UPDATE organization_members SET status='active' WHERE organization_id='org_a' AND user_id='usr_teacher_a'");

  const endedToken = createToken();
  await issueConnectionTicket(h.db, {
    tokenHash: await hashToken(endedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", authSessionId: "auth_stage6", role: "teacher", lastSequence: 0, now: h.now
  });
  h.exec(`UPDATE live_sessions
          SET status='ended', posting_enabled=0, comments_visible=0,
              ended_at='${new Date(h.now + 1).toISOString()}'
          WHERE id='${h.sessionId}'`);
  await expectAuth("ticket consumption revalidates the live session", async () => consumeConnectionTicket(h.db, {
    tokenHash: await hashToken(endedToken), organizationId: "org_a", liveSessionId: h.sessionId,
    userId: "usr_teacher_a", now: h.now + 2
  }), "REALTIME_TICKET_INVALID");
  h.exec(`UPDATE live_sessions
          SET status='active', posting_enabled=1, comments_visible=1, ended_at=NULL
          WHERE id='${h.sessionId}'`);
}

async function testSequenceAndCatchUp(h) {
  const comment = await persistComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    participantTokenHash: "participant_hash_a", idempotencyKey: "realtime_key_0001",
    nickname: "name", message: "first", messageLength: 5,
    retentionDays: 30, now: h.now + 10_000
  });
  const createdEvent = await findRealtimeEventForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    commentId: comment.comment.id, eventType: "message:new", createdAt: comment.comment.createdAt
  });
  check("visible comment receives sequence one", createdEvent?.sequence === 1, createdEvent);

  const settings = await appendRealtimeEvent(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    eventType: "settings:update", payload: { type: "settings:update", commentsVisible: false },
    now: h.now + 11_000
  });
  check("manual realtime event increments sequence", settings.sequence === 2, settings);
  const clear = await appendRealtimeEvent(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    eventType: "message:clear", payload: { type: "message:clear" }, now: h.now + 12_000
  });
  check("sequences are gapless", clear.sequence === 3, clear);

  let sync = await getRealtimeSync(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, lastSequence: 1 });
  check("catch-up returns missing events in order", !sync.resetRequired && sync.events.map((item) => item.sequence).join(",") === "2,3", sync);
  sync = await getRealtimeSync(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, lastSequence: 3 });
  check("up-to-date reconnect has no duplicate events", sync.events.length === 0 && sync.currentSequence === 3, sync);
  const state = h.row("SELECT last_clear_sequence FROM realtime_session_state WHERE live_session_id=?1", h.sessionId);
  check("clear sequence is persisted for snapshot reconstruction", state.last_clear_sequence === 3, state);
}

async function testModerationEvents(h) {
  h.exec(`INSERT INTO session_moderation_settings VALUES ('org_a','${h.sessionId}','pre','usr_teacher_a','${h.createdAt}','${h.createdAt}')`);
  const pending = await persistComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    participantTokenHash: "participant_hash_b", idempotencyKey: "realtime_key_0002",
    nickname: "", message: "pending", messageLength: 7,
    retentionDays: 30, now: h.now + 20_000
  });
  check("pending comment creates no viewer event", h.row("SELECT COUNT(*) AS count FROM realtime_events WHERE source_comment_id=?1", pending.comment.id).count === 0);
  const approved = await moderateComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: pending.comment.id,
    action: "approve", expectedUpdatedAt: pending.comment.updatedAt, reason: "approved for realtime",
    actorUserId: "usr_teacher_a", actorRole: "teacher", now: h.now + 21_000
  });
  const restore = await findRealtimeEventForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: pending.comment.id,
    eventType: "message:restore", createdAt: approved.comment.updatedAt
  });
  check("approval creates restoration event", restore?.payload?.message === "pending", restore);
  const hidden = await moderateComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: pending.comment.id,
    action: "hide", expectedUpdatedAt: approved.comment.updatedAt, reason: "hidden for realtime",
    actorUserId: "usr_teacher_a", actorRole: "teacher", now: h.now + 22_000
  });
  const remove = await findRealtimeEventForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: pending.comment.id,
    eventType: "message:remove", createdAt: hidden.comment.updatedAt
  });
  check("hide creates removal event", remove?.payload?.commentId === pending.comment.id, remove);
}

async function testSnapshotReset(h) {
  const current = h.row("SELECT last_sequence FROM realtime_session_state WHERE live_session_id=?1", h.sessionId).last_sequence;
  h.exec(`DELETE FROM realtime_events WHERE live_session_id='${h.sessionId}' AND sequence < ${current}`);
  const sync = await getRealtimeSync(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, lastSequence: 0 });
  check("pruned history requests a snapshot reset", sync.resetRequired === true && sync.currentSequence === current, sync);
  check("snapshot contains only currently visible comments", sync.snapshot.every((item) => item.moderationState === "visible"), sync.snapshot);
  check("snapshot does not resurrect comments from before the last clear", !sync.snapshot.some((item) => item.message === "first"), sync.snapshot);
  const invalid = await getRealtimeSync(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, lastSequence: current + 100 });
  check("future client sequence forces reset", invalid.resetRequired === true, invalid);
}

async function testPruning(h) {
  h.exec(`UPDATE realtime_events SET created_at='${new Date(h.now - 2000).toISOString()}', expires_at='${new Date(h.now - 1000).toISOString()}'`);
  h.exec(`UPDATE realtime_connection_tickets SET issued_at='${new Date(h.now - 2000).toISOString()}', expires_at='${new Date(h.now - 1000).toISOString()}'`);
  const result = await pruneRealtimeRecords(h.db, { now: h.now, limit: 500 });
  check("scheduled maintenance prunes realtime events", result.eventsDeleted > 0, result);
  check("scheduled maintenance prunes tickets", result.ticketsDeleted > 0, result);
}

async function testEdgeLimiter() {
  const calls = [];
  const env = {
    APP_ENV: "production",
    PUBLIC_RATE_LIMIT_PEPPER: "test-pepper",
    PUBLIC_COMMENT_RATE_LIMITER: { async limit(input) { calls.push(input); return { success: true }; } }
  };
  const request = new Request("https://example.test", { headers: { "cf-connecting-ip": "203.0.113.8" } });
  await enforcePublicCommentEdgeLimit(request, env, "ABC123");
  check("edge limiter receives a pseudonymous key", /^[a-f0-9]{64}$/.test(calls[0]?.key || "") && !calls[0].key.includes("203.0.113.8"), calls);
  await expectAuth("production requires public limiter binding", () => enforcePublicCommentEdgeLimit(request, { APP_ENV: "production", PUBLIC_RATE_LIMIT_PEPPER: "x" }, "ABC123"), "PUBLIC_COMMENT_RATE_LIMITER_NOT_CONFIGURED");
  await expectAuth("edge limiter rejection returns rate limit", () => enforcePublicCommentEdgeLimit(request, {
    APP_ENV: "production", PUBLIC_RATE_LIMIT_PEPPER: "x", PUBLIC_COMMENT_RATE_LIMITER: { async limit() { return { success: false }; } }
  }, "ABC123"), "RATE_LIMITED");
}

async function testHibernationHandlers(h) {
  const socket = new MockSocket({ sessionId: h.sessionId, authSessionId: "auth_stage6", organizationId: "org_a", userId: "usr_teacher_a", role: "teacher", lastAckSequence: 1, lastSentSequence: 3 });
  const state = {
    getWebSockets() { return [socket]; },
    setWebSocketAutoResponse() {},
    acceptWebSocket() {}
  };
  const room = new CommentRoom(state, { DB_V2: h.db });

  const bulkSockets = [];
  for (let index = 0; index < 85; index += 1) {
    const authId = `auth_bulk_${index}`;
    const tokenHash = index.toString(16).padStart(64, "0");
    const csrfHash = (index + 1000).toString(16).padStart(64, "0");
    h.sqlite.prepare(
      `INSERT INTO auth_sessions (
         id, organization_id, user_id, token_hash, csrf_token_hash,
         created_at, last_seen_at, idle_expires_at, absolute_expires_at, revoked_at
       ) VALUES (?1,'org_a','usr_teacher_a',?2,?3,?4,?4,?5,?6,NULL)`
    ).run({ "1": authId, "2": tokenHash, "3": csrfHash, "4": h.createdAt,
      "5": new Date(h.now + 2 * 60 * 60 * 1000).toISOString(),
      "6": new Date(h.now + 12 * 60 * 60 * 1000).toISOString() });
    bulkSockets.push(new MockSocket({
      sessionId: h.sessionId, authSessionId: authId, organizationId: "org_a",
      userId: "usr_teacher_a", role: "teacher", lastAckSequence: 0, lastSentSequence: 0
    }));
  }
  const bulkAuthorized = await room.authorizedAuthSessions(bulkSockets);
  check("auth-session revalidation is safely chunked for many sockets", bulkAuthorized.size === 85, bulkAuthorized.size);

  room.webSocketMessage(socket, JSON.stringify({ type: "ack", sequence: 3 }));
  check("ack updates serialized hibernation attachment", socket.attachment.lastAckSequence === 3, socket.attachment);
  room.webSocketMessage(socket, JSON.stringify({ type: "ack", sequence: 99 }));
  check("ack beyond sent sequence is ignored", socket.attachment.lastAckSequence === 3);
  room.webSocketMessage(socket, "x".repeat(300));
  check("oversized client frame closes socket", socket.closeCode === 1009, socket);

  const event = await appendRealtimeEvent(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    eventType: "message:clear", payload: { type: "message:clear" }, now: h.now + 30_000
  });
  socket.closeCode = 0;
  const delivered = await room.broadcastEvent(event);
  check("hibernation broadcast sends sequence envelope", delivered === 1 && JSON.parse(socket.sent.at(-1)).sequence === event.sequence, socket.sent);
  const duplicate = await room.broadcastEvent(event);
  check("same sequence is not sent twice", duplicate === 0, duplicate);
  h.exec("UPDATE auth_sessions SET revoked_at='" + new Date(h.now + 31_000).toISOString() + "' WHERE id='auth_stage6'");
  const afterRevoke = await appendRealtimeEvent(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    eventType: "settings:update", payload: { type: "settings:update", commentsVisible: true }, now: h.now + 32_000
  });
  const revokedDelivery = await room.broadcastEvent(afterRevoke);
  check("revoked auth session closes an existing socket before delivery", revokedDelivery === 0 && socket.closeCode === 4001, socket);
  room.closeAllSockets(1000, "session closed");
  check("room closure closes hibernated sockets", socket.closeCode === 1000 && socket.closeReason === "session closed", socket);
}

function testViewerClient() {
  const source = readFileSync(resolve(ROOT, "public/assets/viewer.js"), "utf8");
  check("viewer requests one-time live tickets", source.includes("/live-ticket") && source.includes("lastSequence"));
  check("viewer uses bounded exponential reconnect", source.includes("Math.min(30_000") && source.includes("2 **"));
  check("viewer discards duplicate sequence", source.includes("sequence <= lastAppliedSequence"));
  check("viewer detects sequence gaps", source.includes("sequence !== lastAppliedSequence + 1"));
  check("viewer persists only non-secret sequence state", source.includes("CPCV_REALTIME_SEQUENCE") && !/localStorage[^\n]*(token|ticket)/i.test(source));
  check("viewer stops reconnecting when room closes", source.includes("room:closed") && source.includes("realtimeStopped"));
}

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const name of [
    "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
    "0004_precision_hardening.sql", "0005_comment_content_guards.sql",
    "0006_manual_moderation.sql", "0007_realtime.sql",
    "0008_email_auth.sql", "0009_account_lifecycle.sql", "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql"
  ]) sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  const now = Date.now();
  const createdAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  sqlite.exec(`
    INSERT INTO organizations VALUES ('org_a','Organization A','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO users VALUES
      ('usr_teacher_a','teacher.a','Teacher A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL),
      ('usr_admin_a','admin.a','Admin A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,NULL,NULL,NULL);
    INSERT INTO organization_members VALUES
      ('org_a','usr_teacher_a','teacher','active','${createdAt}','${createdAt}',NULL),
      ('org_a','usr_admin_a','admin','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO auth_sessions VALUES
      ('auth_stage6','org_a','usr_teacher_a','${'T'.repeat(64)}','${'C'.repeat(64)}','${createdAt}','${createdAt}','${new Date(now + 2 * 60 * 60 * 1000).toISOString()}','${new Date(now + 12 * 60 * 60 * 1000).toISOString()}',NULL);
    INSERT INTO live_sessions VALUES
      ('sess_realtime','org_a','usr_teacher_a','RTM234','Realtime Class',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${expiresAt}',NULL,NULL);
  `);
  const db = new D1DatabaseAdapter(sqlite);
  return {
    sqlite, db, now, createdAt, sessionId: "sess_realtime",
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    exec: (sql) => sqlite.exec(sql),
    close: () => sqlite.close()
  };
}

class MockSocket {
  constructor(attachment = {}) { this.attachment = attachment; this.sent = []; this.closeCode = 0; }
  send(value) { this.sent.push(value); }
  close(code, reason) { this.closeCode = code; this.closeReason = reason; }
  serializeAttachment(value) { this.attachment = structuredClone(value); }
  deserializeAttachment() { return structuredClone(this.attachment); }
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
async function expectAuth(name, fn, code) {
  try { await fn(); check(name, false, "no error"); }
  catch (error) { check(name, error?.code === code, error); }
}
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
