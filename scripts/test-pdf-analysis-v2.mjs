import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bindPdfToSession,
  buildSessionAnalytics,
  createAnalyticsSnapshot,
  getAnalyticsSnapshot,
  getSessionPdfState,
  listAnalyticsSnapshots,
  persistUnderstandingSignal,
  runPdfAnalyticsRetention,
  updatePdfPageState
} from "../src/pdf-analysis/repository.js";
import { persistComment, listSessionComments } from "../src/comments/repository.js";
import { buildAnalyticsCsv } from "../src/pdf-analysis/csv.js";
import { normalizePdfBindingInput } from "../src/pdf-analysis/validation.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

async function main() {
  await testStage8SchemaAndFlow();
  await testPrecisionHardening();
  await testMetadataRetention();
  await testLegacyCompatibility();
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 8 PDF analytics summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function testStage8SchemaAndFlow() {
  const h = createHarness({ includeStage8: true });
  try {
    const tables = new Set(h.rows("SELECT name FROM sqlite_master WHERE type='table'").map((row) => row.name));
    for (const name of ["pdf_documents", "session_pdf_bindings", "session_pdf_state", "pdf_page_events", "comment_page_links", "understanding_signals", "analytics_snapshots"]) {
      check(`schema includes ${name}`, tables.has(name));
    }
    const pdfColumns = h.rows("PRAGMA table_info(pdf_documents)").map((row) => row.name);
    check("PDF metadata table excludes filename, bytes, text, and storage URL", !pdfColumns.some((name) => /file_name|filename|bytes_blob|content|page_text|url/i.test(name)), pdfColumns);

    const bound = await bindPdfToSession(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      sha256Hex: "a".repeat(64), pdfjsFingerprint: "pdfjs-secondary-id", pageCount: 3,
      fileSizeBytes: 123456, now: h.now
    });
    check("PDF binds with hash metadata only", bound.currentPage === 1 && bound.pageCount === 3 && bound.documentSha256 === "a".repeat(64), bound);
    check("binding creates one page event", Number(h.row("SELECT COUNT(*) AS count FROM pdf_page_events")?.count) === 1);
    const rebound = await bindPdfToSession(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      sha256Hex: "a".repeat(64), pdfjsFingerprint: "pdfjs-secondary-id", pageCount: 3,
      fileSizeBytes: 123456, now: h.now + 500
    });
    check("binding the same PDF is idempotent", rebound.reused === true && rebound.bindingId === bound.bindingId && Number(h.row("SELECT COUNT(*) AS count FROM pdf_page_events")?.count) === 1, rebound);

    const stale = await updatePdfPageState(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      bindingId: bound.bindingId, pageNumber: 2, clientVersion: 1, now: h.now + 1000
    });
    check("reordered page update is ignored", stale.accepted === false && stale.stale === true && stale.currentPage === 1, stale);
    const page2 = await updatePdfPageState(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      bindingId: bound.bindingId, pageNumber: 2, clientVersion: 2, now: h.now + 10_000
    });
    check("monotonic page update is accepted", page2.accepted === true && page2.currentPage === 2, page2);

    const comment = await persist(h, "idem-stage8-a-0001", "このページは難しい？", "token-a", h.now + 20_000);
    check("comment is linked to server current PDF page", comment.pdfPageNumber === 2, comment);
    const link = h.row("SELECT page_number,link_method FROM comment_page_links WHERE comment_id=?1", comment.id);
    check("page link evidence is persisted", Number(link?.page_number) === 2 && link?.link_method === "server_current_page", link);

    const signals = [
      ["1".repeat(64), "understood"],
      ["2".repeat(64), "unsure"],
      ["3".repeat(64), "confused"]
    ];
    for (let index = 0; index < signals.length; index += 1) {
      const [token, signal] = signals[index];
      await persistUnderstandingSignal(h.db, {
        organizationId: "org_a", liveSessionId: h.sessionId,
        participantTokenHash: token, signal, retentionDays: 30,
        bindingId: bound.bindingId, pageNumber: 2, clientVersion: 2,
        now: h.now + 30_000 + index * 3000
      });
    }
    check("three anonymous signals are stored for page 2", Number(h.row("SELECT COUNT(*) AS count FROM understanding_signals WHERE page_number=2")?.count) === 3);

    await updatePdfPageState(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      bindingId: bound.bindingId, pageNumber: 3, clientVersion: 3, now: h.now + 40_000
    });
    let pageChangedError = null;
    try {
      await persistUnderstandingSignal(h.db, {
        organizationId: "org_a", liveSessionId: h.sessionId,
        participantTokenHash: "9".repeat(64), signal: "understood", retentionDays: 30,
        bindingId: bound.bindingId, pageNumber: 2, clientVersion: 2,
        now: h.now + 42_000
      });
    } catch (error) { pageChangedError = error; }
    check("understanding response is rejected when the displayed page has changed", pageChangedError?.code === "PDF_PAGE_CHANGED" && Number(h.row("SELECT COUNT(*) AS count FROM understanding_signals WHERE participant_id IN (SELECT id FROM participants WHERE token_hash=?1)", "9".repeat(64))?.count) === 0, pageChangedError);

    h.run("UPDATE live_sessions SET posting_enabled=0 WHERE id=?1", h.sessionId);
    await persistUnderstandingSignal(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId,
      participantTokenHash: "4".repeat(64), signal: "confused", retentionDays: 1,
      bindingId: bound.bindingId, pageNumber: 3, clientVersion: 3,
      now: h.now + 43_000
    });
    const retainedUntil = Date.parse(h.row("SELECT retained_until FROM understanding_signals WHERE page_number=3")?.retained_until || "");
    check("understanding works while comment posting is disabled", Number(h.row("SELECT COUNT(*) AS count FROM understanding_signals WHERE page_number=3")?.count) === 1);
    check("understanding retention is fixed at 180 days", Math.abs(retainedUntil - (h.now + 43_000 + 180 * 86_400_000)) < 1000, retainedUntil);
    h.run("UPDATE live_sessions SET posting_enabled=1 WHERE id=?1", h.sessionId);

    const analytics = await buildSessionAnalytics(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, now: h.now + 50_000
    });
    const second = analytics.pages.find((page) => page.pageNumber === 2);
    const third = analytics.pages.find((page) => page.pageNumber === 3);
    check("analytics counts comments and question marks by page", second.commentCount === 1 && second.questionMarkCommentCount === 1, second);
    check("group of three exposes aggregate understanding only", second.signalTotal === 3 && second.suppressed === false && second.understandingScore === 50, second);
    check("group smaller than three suppresses signal breakdown", third.signalTotal === 1 && third.suppressed === true && third.confusedCount == null && third.understandingScore == null, third);
    check("analytics response contains no participant identifiers or comment text", !/participant|nickname|message|token_hash/i.test(JSON.stringify(analytics)), analytics);
    check("page dwell is derived from page-change events", second.viewCount === 1 && second.dwellSeconds === 30, second);

    const snapshot = await createAnalyticsSnapshot(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a", now: h.now + 50_000
    });
    check("snapshot has deterministic SHA-256 checksum", /^[0-9a-f]{64}$/.test(snapshot.checksumSha256), snapshot.checksumSha256);
    const loaded = await getAnalyticsSnapshot(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, snapshotId: snapshot.id
    });
    check("snapshot reload preserves checksum and aggregate pages", loaded.checksumSha256 === snapshot.checksumSha256 && loaded.pages.length === 3, loaded);
    const listed = await listAnalyticsSnapshots(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, limit: 20 });
    check("snapshot appears in session-scoped list", listed.length === 1 && listed[0].id === snapshot.id, listed);
    const csv = buildAnalyticsCsv(loaded);
    check("analytics CSV is aggregate and has no personal columns", csv.includes("ページ") && !/nickname|participant|token_hash|message_text/i.test(csv), csv.slice(0, 200));

    const cleanupNow = h.now + 181 * 86_400_000;
    const cleanup = await runPdfAnalyticsRetention(h.db, { now: cleanupNow, limit: 100 });
    check("Stage 8 retention deletes expired signals and snapshots", cleanup.understandingSignalsDeleted === 4 && cleanup.analyticsSnapshotsDeleted === 1, cleanup);
    check("Stage 8 migration preserves foreign keys", h.rows("PRAGMA foreign_key_check").length === 0, h.rows("PRAGMA foreign_key_check"));
    check("Stage 8 database quick_check is ok", h.row("PRAGMA quick_check")?.quick_check === "ok", h.row("PRAGMA quick_check"));
  } finally {
    h.close();
  }
}

async function testPrecisionHardening() {
  const h = createHarness({ includeStage8: true });
  try {
    let fingerprintError = null;
    try {
      normalizePdfBindingInput({
        sha256Hex: "a".repeat(64), pageCount: 1, fileSizeBytes: 10,
        pdfjsFingerprint: "bad\nfingerprint"
      });
    } catch (error) { fingerprintError = error; }
    check("PDF fingerprint rejects control characters", fingerprintError?.code === "PDF_FINGERPRINT_INVALID", fingerprintError);

    const bound = await bindPdfToSession(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      sha256Hex: "b".repeat(64), pdfjsFingerprint: "safe-fingerprint:1", pageCount: 3,
      fileSizeBytes: 2222, now: h.now
    });

    let outOfBoundsError = null;
    try {
      h.run(
        `INSERT INTO pdf_pages (pdf_document_id,page_number,organization_id,first_seen_at,last_seen_at)
         VALUES (?1,4,'org_a',?2,?2)`,
        bound.pdfDocumentId, new Date(h.now).toISOString()
      );
    } catch (error) { outOfBoundsError = error; }
    check("database trigger rejects page numbers outside the document", Boolean(outOfBoundsError), outOfBoundsError);

    const token = "a".repeat(64);
    for (let page = 1; page <= 3; page += 1) {
      if (page > 1) {
        await updatePdfPageState(h.db, {
          organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
          bindingId: bound.bindingId, pageNumber: page, clientVersion: page,
          now: h.now + page * 10_000
        });
      }
      await persistUnderstandingSignal(h.db, {
        organizationId: "org_a", liveSessionId: h.sessionId,
        participantTokenHash: token, signal: "understood",
        bindingId: bound.bindingId, pageNumber: page, clientVersion: page,
        now: h.now + page * 10_000 + 1000
      });
    }
    const onePersonAnalytics = await buildSessionAnalytics(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, now: h.now + 40_000
    });
    check("overall small-group suppression counts distinct people, not page answers", onePersonAnalytics.summary.totalSignals === 3 && onePersonAnalytics.summary.overallSuppressed === true && onePersonAnalytics.summary.overallUnderstandingScore == null, onePersonAnalytics.summary);

    const expiringComment = await persist(h, "precision-expiring-comment", "期限確認？", "comment-expiry-token", h.now + 34_000);
    const expiredAt = new Date(h.now + 35_000).toISOString();
    h.run("UPDATE understanding_signals SET retained_until=?1", expiredAt);
    h.run("UPDATE comments SET retained_until=?1 WHERE id=?2", expiredAt, expiringComment.id);
    const afterExpiry = await buildSessionAnalytics(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, now: h.now + 40_000
    });
    check("expired understanding signals are excluded before scheduled cleanup", afterExpiry.summary.totalSignals === 0 && afterExpiry.summary.overallUnderstandingScore == null, afterExpiry.summary);
    check("expired comments are excluded before scheduled cleanup", afterExpiry.summary.totalComments === 0 && afterExpiry.pages.find((page) => page.pageNumber === 3)?.questionMarkCommentCount === 0, afterExpiry.summary);

    const liveSignalTime = h.now + 50_000;
    await persistUnderstandingSignal(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId,
      participantTokenHash: token, signal: "unsure",
      bindingId: bound.bindingId, pageNumber: 3, clientVersion: 3,
      now: liveSignalTime
    });
    const refreshed = h.row("SELECT us.retained_until FROM understanding_signals us JOIN participants p ON p.id=us.participant_id WHERE p.token_hash=?1 AND us.page_number=3 LIMIT 1", token);
    check("an expired response can be renewed safely", Date.parse(refreshed?.retained_until || "") > liveSignalTime + 179 * 86_400_000, refreshed);

    const snapshot = await createAnalyticsSnapshot(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a", now: h.now + 60_000
    });
    let immutableSnapshotError = null;
    try {
      h.run("UPDATE analytics_snapshots SET summary_json=?1 WHERE id=?2", JSON.stringify({ tampered: true }), snapshot.id);
    } catch (error) { immutableSnapshotError = error; }
    check("database prevents snapshot mutation", Boolean(immutableSnapshotError), immutableSnapshotError);

    const corruptSnapshotId = "anl_corrupt_snapshot_0001";
    h.run(
      `INSERT INTO analytics_snapshots (
         id,organization_id,live_session_id,binding_id,pdf_document_id,
         source_cutoff_at,minimum_group_size,schema_version,summary_json,pages_json,
         checksum_sha256,created_by_user_id,created_at,retained_until
       )
       SELECT ?1,organization_id,live_session_id,binding_id,pdf_document_id,
              source_cutoff_at,minimum_group_size,schema_version,?2,pages_json,
              checksum_sha256,created_by_user_id,created_at,retained_until
       FROM analytics_snapshots WHERE id=?3`,
      corruptSnapshotId, JSON.stringify({ tampered: true }), snapshot.id
    );
    let corruptError = null;
    try {
      await getAnalyticsSnapshot(h.db, {
        organizationId: "org_a", liveSessionId: h.sessionId, snapshotId: corruptSnapshotId,
        now: h.now + 61_000
      });
    } catch (error) { corruptError = error; }
    check("snapshot checksum verification detects valid-JSON corruption", corruptError?.code === "ANALYTICS_SNAPSHOT_CORRUPT", corruptError);

    const future = h.now + 181 * 86_400_000;
    const expiredList = await listAnalyticsSnapshots(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, limit: 20, now: future
    });
    check("expired snapshots are hidden before scheduled cleanup", expiredList.length === 0, expiredList);
    let expiredSnapshotError = null;
    try {
      await getAnalyticsSnapshot(h.db, {
        organizationId: "org_a", liveSessionId: h.sessionId, snapshotId: snapshot.id, now: future
      });
    } catch (error) { expiredSnapshotError = error; }
    check("expired snapshots cannot be exported before cleanup", expiredSnapshotError?.code === "ANALYTICS_SNAPSHOT_NOT_FOUND", expiredSnapshotError);

    h.run(`INSERT INTO pdf_documents (
      id,organization_id,sha256_hex,pdfjs_fingerprint,page_count,file_size_bytes,
      created_by_user_id,created_at,last_seen_at
    ) VALUES ('pdf_other','org_a',?1,NULL,1,10,'usr_owner_a',?2,?2)`, "c".repeat(64), new Date(h.now).toISOString());
    let inconsistentSignalError = null;
    try {
      h.run("UPDATE understanding_signals SET pdf_document_id='pdf_other' WHERE binding_id=?1", bound.bindingId);
    } catch (error) { inconsistentSignalError = error; }
    check("database trigger rejects cross-document understanding evidence", Boolean(inconsistentSignalError), inconsistentSignalError);
  } finally {
    h.close();
  }
}

async function testMetadataRetention() {
  const h = createHarness({ includeStage8: true });
  try {
    const bound = await bindPdfToSession(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, userId: "usr_owner_a",
      sha256Hex: "d".repeat(64), pdfjsFingerprint: "retention-test", pageCount: 2,
      fileSizeBytes: 3333, now: h.now
    });
    h.run("UPDATE live_sessions SET ended_at=?1,status='ended',posting_enabled=0,comments_visible=0 WHERE id=?2", new Date(h.now + 1000).toISOString(), h.sessionId);
    const cleanup = await runPdfAnalyticsRetention(h.db, {
      now: h.now + 181 * 86_400_000,
      limit: 100
    });
    check("old page events are deleted after metadata retention", cleanup.pageEventsDeleted === 1 && Number(h.row("SELECT COUNT(*) AS count FROM pdf_page_events WHERE binding_id=?1", bound.bindingId)?.count) === 0, cleanup);
    check("unused old PDF bindings and state are deleted", cleanup.bindingsDeleted === 1 && Number(h.row("SELECT COUNT(*) AS count FROM session_pdf_bindings WHERE id=?1", bound.bindingId)?.count) === 0 && Number(h.row("SELECT COUNT(*) AS count FROM session_pdf_state WHERE live_session_id=?1", h.sessionId)?.count) === 0, cleanup);
    check("orphan PDF metadata is deleted after retention", cleanup.pdfDocumentsDeleted === 1 && Number(h.row("SELECT COUNT(*) AS count FROM pdf_documents WHERE id=?1", bound.pdfDocumentId)?.count) === 0, cleanup);
  } finally {
    h.close();
  }
}

async function testLegacyCompatibility() {
  const h = createHarness({ includeStage8: false });
  try {
    const comment = await persist(h, "legacy-no-stage8", "旧DBでも投稿可能", "legacy-token", h.now + 20_000);
    check("pre-Stage-8 DB still accepts comments", Boolean(comment.id) && comment.pdfPageNumber == null, comment);
    const listed = await listSessionComments(h.db, {
      organizationId: "org_a", liveSessionId: h.sessionId, limit: 20, states: [], cursor: null
    });
    check("pre-Stage-8 comment list returns null page instead of failing", listed.rows.length === 1 && listed.rows[0].pdfPageNumber == null, listed);
  } finally {
    h.close();
  }
}

async function persist(h, key, message, tokenHash, now) {
  const result = await persistComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    participantTokenHash: tokenHash, idempotencyKey: key,
    nickname: "", message, messageLength: [...message].length,
    retentionDays: 30, now,
    filterDecision: {
      action: "allow", displayMessage: null, aiRequired: false, version: 0,
      matches: [], requiresReview: false, detectedLanguage: "ja",
      languageConfidenceMilli: 1000, unsupportedLanguage: false
    }
  });
  return result.comment;
}

function createHarness({ includeStage8 }) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const migrations = [
    "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
    "0004_precision_hardening.sql", "0005_comment_content_guards.sql", "0006_manual_moderation.sql",
    "0007_realtime.sql", "0008_email_auth.sql", "0009_account_lifecycle.sql",
    "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql",
    "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql"
  ];
  if (includeStage8) migrations.push("0015_pdf_page_analytics.sql", "0016_stage08_precision_hardening.sql");
  for (const name of migrations) sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
  const now = Date.now();
  const createdAt = new Date(now - 60_000).toISOString();
  const expiresAt = new Date(now + 6 * 60 * 60 * 1000).toISOString();
  sqlite.exec(`
    INSERT INTO organizations (id,name,status,created_at,updated_at,deleted_at)
      VALUES ('org_a','Organization A','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO users (id,login_id,display_name,password_scheme,password_hash,password_salt,password_changed_at,status,created_at,updated_at,deleted_at,failed_login_count,locked_until,require_password_change,email,email_verified_at,email_updated_at) VALUES
      ('usr_owner_a','owner.a','Owner A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,'owner@example.test','${createdAt}','${createdAt}');
    INSERT INTO organization_members (organization_id,user_id,role,status,created_at,updated_at,removed_at)
      VALUES ('org_a','usr_owner_a','owner','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO live_sessions (id,organization_id,created_by_user_id,public_code,title,posting_enabled,comments_visible,comment_display_seconds,comment_display_mode,status,created_at,updated_at,started_at,expires_at,ended_at,deleted_at)
      VALUES ('sess_stage8','org_a','usr_owner_a','STG888','Stage 8 Class',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${expiresAt}',NULL,NULL);
  `);
  return {
    sqlite, db: new D1DatabaseAdapter(sqlite), now, sessionId: "sess_stage8",
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    run: (sql, ...values) => runStatement(sqlite.prepare(sql), values, sql),
    close: () => sqlite.close()
  };
}

class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const output = statements.map((statement) => statement.executeBatch());
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
  executeBatch() {
    if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(this.sql)) {
      return { success: true, results: this.executeAll(), meta: { changes: 0 } };
    }
    return this.executeRun();
  }
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
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
