import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFilterTerm, evaluateCommentFilter, updateFilterPolicies, updateSessionFilterSettings } from "../src/content-filter/repository.js";
import { normalizeFilterTerm } from "../src/content-filter/normalization.js";
import { persistComment, listSessionComments } from "../src/comments/repository.js";
import { createAiJobsForComment, updateOrganizationAiSettings, updateSessionAiSettings } from "../src/ai/repository.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

async function main() {
  const h = createHarness();
  try {
    await testSchema(h);
    await testDeterministicMaskAndReject(h);
    await testObfuscationAndAiRouting(h);
    await testPersistenceAndRealtime(h);
    await testMultilingualAndMaskingBugs(h);
  } finally {
    h.close();
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 7.6 content-filter summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function testSchema(h) {
  const tables = h.rows("SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('content_filter_terms','organization_content_filter_policies','session_content_filter_settings','comment_filter_matches') ORDER BY name");
  check("content-filter tables exist", tables.length === 4, tables);
  check("foreign keys clean", h.rows("PRAGMA foreign_key_check").length === 0);
  check("quick check ok", h.row("PRAGMA quick_check")?.quick_check === "ok");
  const policyCount = h.row("SELECT COUNT(*) AS count FROM organization_content_filter_policies WHERE organization_id='org_a'")?.count;
  check("all category policies are initialized", Number(policyCount) === 10, policyCount);
  const settings = h.row("SELECT enabled,ai_routing_mode,mask_character FROM session_content_filter_settings WHERE live_session_id=?1", h.sessionId);
  check("session filter defaults disabled and ambiguous routing", settings?.enabled === 0 && settings.ai_routing_mode === "ambiguous" && settings.mask_character === "＊", settings);
  const columns = h.rows("PRAGMA table_info(content_filter_terms)").map((row) => row.name);
  check("dictionary stores language metadata", columns.includes("language_code"), columns);
  check("dictionary stores boundary mode", columns.includes("boundary_mode"), columns);
}

async function testDeterministicMaskAndReject(h) {
  await enablePolicy(h, "sexual", { reviewMinSeverity: 2, maskMinSeverity: 3, rejectMinSeverity: 5 });
  await updateSessionFilterSettings(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, actorUserId: "usr_owner_a",
    enabled: true, aiRoutingMode: "ambiguous", maskCharacter: "＊", now: h.now + 100
  });
  await addTerm(h, "ちんこ", "sexual", 3, true);
  await addTerm(h, "露骨危険語", "sexual", 5, true);

  const punctuation = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "ち、んこ" });
  check("punctuation insertion is normalized to a deterministic match", punctuation.action === "mask" && punctuation.matches[0]?.matchKind === "compact", punctuation);
  check("punctuation-obfuscated term is masked", punctuation.displayMessage === "＊＊＊＊", punctuation.displayMessage);
  check("deterministic mask does not require AI in ambiguous-only mode", punctuation.aiRequired === false, punctuation);

  const katakana = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "チンコ" });
  check("Katakana and Hiragana are folded for matching", katakana.action === "mask" && katakana.displayMessage === "＊＊＊", katakana);

  const rejected = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "これは露骨危険語です" });
  check("level 5 term reaches reject policy", rejected.action === "reject", rejected);

  const political = await addTerm(h, "政府批判", "political", 5, true);
  const politicalDecision = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: political.term });
  check("political category is inactive by default", politicalDecision.action === "allow", politicalDecision);
}

async function testObfuscationAndAiRouting(h) {
  await enablePolicy(h, "harassment", { reviewMinSeverity: 2, maskMinSeverity: 4, rejectMinSeverity: 5 });
  await addTerm(h, "ばかやろう", "harassment", 4, true);
  const fuzzy = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "ばかやるう" });
  check("one-edit evasion becomes an ambiguous review", fuzzy.action === "review" && fuzzy.ambiguous && fuzzy.matches[0]?.matchKind === "fuzzy", fuzzy);
  check("ambiguous match is routed to AI", fuzzy.aiRequired === true, fuzzy);

  await updateOrganizationAiSettings(h.db, {
    organizationId: "org_a", enabled: true, moderationDailyLimit: 100, translationDailyLimit: 100,
    actorUserId: "usr_owner_a", now: h.now + 200
  });
  await updateSessionAiSettings(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    moderationEnabled: true, translationEnabled: false, targetLanguage: "ja",
    actorUserId: "usr_owner_a", now: h.now + 300
  });
  const safe = await persist(h, "safe", "普通の授業コメント", { action: "allow", displayMessage: null, aiRequired: false, version: 1, matches: [] }, h.now + 1000);
  const safeJobs = await createAiJobsForComment(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, commentId: safe.id, now: h.now + 1100 });
  check("safe comment skips moderation AI in ambiguous-only mode", safeJobs.length === 0, safeJobs);

  h.exec("UPDATE participants SET next_post_at=created_at");
  const ambiguous = await persist(h, "amb", "ばかやるう", fuzzy, h.now + 12000);
  const ambiguousJobs = await createAiJobsForComment(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, commentId: ambiguous.id, now: h.now + 12100 });
  check("ambiguous comment creates only moderation AI job", ambiguousJobs.length === 1 && ambiguousJobs[0].jobType === "moderation", ambiguousJobs);
  check("ambiguous comment remains pending until human or later policy decision", ambiguous.moderationState === "pending", ambiguous);
}

async function testPersistenceAndRealtime(h) {
  h.exec("UPDATE participants SET next_post_at=created_at");
  const decision = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "ち、んこ" });
  const comment = await persist(h, "masked", "ち、んこ", decision, h.now + 24000);
  const stored = h.row("SELECT message,display_message,filter_action,filter_ai_required FROM comments WHERE id=?1", comment.id);
  check("original and masked display text are stored separately", stored?.message === "ち、んこ" && stored.display_message === "＊＊＊＊" && stored.filter_action === "mask", stored);
  const match = h.row("SELECT category,severity,match_kind,obfuscation_score FROM comment_filter_matches WHERE comment_id=?1", comment.id);
  check("filter match evidence is stored without duplicating the term text", match?.category === "sexual" && match.severity === 3 && match.match_kind === "compact", match);
  const event = h.row("SELECT payload_json FROM realtime_events WHERE source_comment_id=?1 AND event_type='message:new' ORDER BY sequence DESC LIMIT 1", comment.id);
  const payload = JSON.parse(event.payload_json);
  check("realtime event contains masked text only", payload.message === "＊＊＊＊" && !event.payload_json.includes("ち、んこ"), payload);
  const listed = await listSessionComments(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, limit: 50, states: [] });
  const row = listed.rows.find((item) => item.id === comment.id);
  check("teacher view keeps original and display forms", row?.message === "ち、んこ" && row.displayMessage === "＊＊＊＊", row);
  check("teacher view includes dictionary evidence", row?.filter?.matches?.[0]?.category === "sexual", row?.filter);
}

async function testMultilingualAndMaskingBugs(h) {
  await enablePolicy(h, "profanity", { reviewMinSeverity: 2, maskMinSeverity: 3, rejectMinSeverity: 5 });
  await addTerm(h, "chat", "profanity", 3, false, { languageCode: "en", boundaryMode: "word" });
  const frenchHomograph = await addTerm(h, "chat", "profanity", 3, false, { languageCode: "fr", boundaryMode: "word" });
  check("same spelling can be registered for different languages", frenchHomograph.languageCode === "fr", frenchHomograph);
  await addTerm(h, "ass", "profanity", 3, true, { languageCode: "en", boundaryMode: "auto" });
  const embedded = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "class assignment" });
  check("English auto boundary avoids substring false positive", embedded.action === "allow", embedded);
  const standalone = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "ass!" });
  check("English standalone word still matches", standalone.action === "mask" && standalone.displayMessage === "＊＊＊!", standalone);

  await addTerm(h, "bad", "profanity", 3, false, { languageCode: "en", boundaryMode: "word", matchMode: "strict" });
  const repeated = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "bad bad" });
  check("all repeated deterministic matches are masked", repeated.displayMessage === "＊＊＊ ＊＊＊" && repeated.matches.length === 2, repeated);
  const zeroWidth = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "b\u200bad" });
  check("strict match maps zero-width obfuscation to the correct original span", zeroWidth.action === "mask" && !zeroWidth.displayMessage.includes("d"), zeroWidth);

  await addTerm(h, "คำหยาบ", "profanity", 3, false, { languageCode: "th", boundaryMode: "substring" });
  const thai = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "คำหยาบ" });
  check("Thai combining marks are preserved for matching", thai.action === "mask", thai);

  await addTerm(h, "गाली", "profanity", 3, false, { languageCode: "hi", boundaryMode: "word" });
  const hindi = await evaluateCommentFilter(h.db, { organizationId: "org_a", liveSessionId: h.sessionId, message: "यह गाली है" });
  check("Devanagari combining marks are preserved for matching", hindi.action === "mask", hindi);
}

async function enablePolicy(h, category, levels) {
  const current = h.rows("SELECT category,enabled,review_min_severity,mask_min_severity,reject_min_severity FROM organization_content_filter_policies WHERE organization_id='org_a'");
  const policies = current.map((row) => ({
    category: row.category,
    enabled: row.category === category ? true : Boolean(row.enabled),
    reviewMinSeverity: row.category === category ? levels.reviewMinSeverity : nullable(row.review_min_severity),
    maskMinSeverity: row.category === category ? levels.maskMinSeverity : nullable(row.mask_min_severity),
    rejectMinSeverity: row.category === category ? levels.rejectMinSeverity : nullable(row.reject_min_severity)
  }));
  await updateFilterPolicies(h.db, { organizationId: "org_a", actorUserId: "usr_owner_a", policies, now: h.now + 50 });
}

async function addTerm(h, term, category, severity, fuzzyEnabled, options = {}) {
  const normalized = normalizeFilterTerm(term);
  return createFilterTerm(h.db, {
    organizationId: "org_a", actorUserId: "usr_owner_a", category, severity,
    matchMode: options.matchMode || "normalized", fuzzyEnabled,
    languageCode: options.languageCode || "und", boundaryMode: options.boundaryMode || "auto",
    ...normalized, now: h.now + severity + Math.floor(Math.random() * 1000)
  });
}

async function persist(h, suffix, message, filterDecision, now) {
  const result = await persistComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    participantTokenHash: `filter_participant_${suffix}`,
    idempotencyKey: `filter_${suffix}_${now}`,
    nickname: suffix, message, messageLength: Array.from(message).length,
    retentionDays: 30, filterDecision, now
  });
  return result.comment;
}

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const migrations = [
    "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
    "0004_precision_hardening.sql", "0005_comment_content_guards.sql",
    "0006_manual_moderation.sql", "0007_realtime.sql", "0008_email_auth.sql",
    "0009_account_lifecycle.sql", "0010_ai_moderation_translation.sql",
    "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
    "0014_filter_pack_expansion.sql"
  ];
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
      VALUES ('sess_filter','org_a','usr_owner_a','FLT234','Filter Class',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${expiresAt}',NULL,NULL);
  `);
  const db = new D1DatabaseAdapter(sqlite);
  return {
    sqlite, db, now, sessionId: "sess_filter",
    row: (sql, ...values) => queryOne(sqlite, sql, values),
    rows: (sql, ...values) => queryAll(sqlite, sql, values),
    exec: (sql) => sqlite.exec(sql), close: () => sqlite.close()
  };
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
function nullable(value) { return value == null ? null : Number(value); }
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
