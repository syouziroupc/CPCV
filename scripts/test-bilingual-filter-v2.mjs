import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateCommentFilter,
  evaluateTranslationFilter,
  getSessionFilterSettings,
  installFilterPack,
  listOrganizationFilter,
  updateFilterPolicies,
  updateSessionFilterSettings
} from "../src/content-filter/repository.js";
import { persistComment } from "../src/comments/repository.js";
import {
  completeTranslationJob,
  createAiJobsForComment,
  updateOrganizationAiSettings,
  updateSessionAiSettings
} from "../src/ai/repository.js";
import { makeId } from "../src/auth/request.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];

async function main() {
  const h = createHarness();
  try {
    await testSchemaAndPacks(h);
    await testBilingualPreFilter(h);
    await testUnsupportedLanguageEscalation(h);
    await testTranslationPostFilter(h);
  } finally {
    h.close();
  }
  const passed = results.filter((item) => item.ok).length;
  const failed = results.length - passed;
  console.log(`\nStage 7.7 bilingual filter summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
  if (failed) process.exitCode = 1;
}

async function testSchemaAndPacks(h) {
  const commentColumns = h.rows("PRAGMA table_info(comments)").map((row) => row.name);
  const translationColumns = h.rows("PRAGMA table_info(translations)").map((row) => row.name);
  check("comments store detected language", commentColumns.includes("detected_language") && commentColumns.includes("unsupported_language"), commentColumns);
  check("translations store filtered display text", translationColumns.includes("display_text") && translationColumns.includes("filter_action"), translationColumns);
  let data = await listOrganizationFilter(h.db, "org_a");
  check("Japanese and English core and context packs are available but not silently installed", data.packs.length === 4 && data.packs.every((pack) => !pack.installed), data.packs);
  const ja = await installFilterPack(h.db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "ja-core-v1", now: h.now + 1 });
  const en = await installFilterPack(h.db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "en-core-v1", now: h.now + 2 });
  data = await listOrganizationFilter(h.db, "org_a");
  check("both core packs install as editable organization terms", data.packs.filter((pack) => pack.id.endsWith("core-v1")).every((pack) => pack.installed) && data.packs.filter((pack) => pack.id.includes("context")).every((pack) => !pack.installed) && data.terms.length === ja.pack.termCount + en.pack.termCount, { packs: data.packs, terms: data.terms.length });
  const countBefore = data.terms.length;
  await installFilterPack(h.db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "ja-core-v1", now: h.now + 3 });
  data = await listOrganizationFilter(h.db, "org_a");
  check("pack installation is idempotent", data.terms.length === countBefore, data.terms.length);
  check("pack contains no political category terms", data.terms.every((term) => term.category !== "political"), data.terms.filter((term) => term.category === "political"));
}

async function testBilingualPreFilter(h) {
  await enableStandardPolicies(h);
  await updateSessionFilterSettings(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, actorUserId: "usr_owner_a",
    enabled: true, aiRoutingMode: "ambiguous", maskCharacter: "＊",
    translationFilterEnabled: true, unsupportedLanguageMode: "ai_review", now: h.now + 100
  });
  const ja = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "ち、んこ"
  });
  check("Japanese pack masks punctuation evasion before translation", ja.action === "mask" && ja.displayMessage === "＊＊＊＊" && ja.detectedLanguage === "ja", ja);
  const en = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "you are an asshole"
  });
  check("English pack masks a whole English word before translation", en.action === "mask" && en.displayMessage && !en.displayMessage.includes("asshole") && en.detectedLanguage === "en", en);
  const embedded = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "This class assignment is useful"
  });
  check("English word boundaries avoid matching inside assignment or class", embedded.action === "allow" && embedded.detectedLanguage === "en", embedded);
}

async function testUnsupportedLanguageEscalation(h) {
  const unsupported = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "Hola amigo, gracias"
  });
  check("non-Japanese and non-English text is held for review", unsupported.action === "review" && unsupported.requiresReview && unsupported.unsupportedLanguage, unsupported);
  check("unsupported language requests AI reference review", unsupported.aiRequired === true, unsupported);
  const mixedShort = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "no puta"
  });
  check("shared short Latin words do not misclassify unsupported text as English", mixedShort.unsupportedLanguage === true && mixedShort.action === "review", mixedShort);
  const clearEnglish = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "I agree with this comment"
  });
  check("clear English sentence remains supported", clearEnglish.detectedLanguage === "en" && clearEnglish.unsupportedLanguage === false, clearEnglish);
  const comment = await persist(h, "spanish", "Hola amigo, gracias", unsupported, h.now + 20_000);
  check("unsupported language comment is persisted pending", comment.moderationState === "pending" && comment.language.unsupported === true, comment);

  await updateOrganizationAiSettings(h.db, {
    organizationId: "org_a", enabled: true, moderationDailyLimit: 100, translationDailyLimit: 100,
    actorUserId: "usr_owner_a", now: h.now + 20_100
  });
  await updateSessionAiSettings(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    moderationEnabled: false, translationEnabled: true, targetLanguage: "ja",
    actorUserId: "usr_owner_a", now: h.now + 20_200
  });
  const jobs = await createAiJobsForComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, commentId: comment.id, now: h.now + 20_300
  });
  check("unsupported language creates a moderation AI job even when ordinary AI moderation is off", jobs.length === 1 && jobs[0].jobType === "moderation", jobs);
  check("pending unsupported comment is not translated before human approval", jobs.every((job) => job.jobType !== "translation"), jobs);
}

async function testTranslationPostFilter(h) {
  h.exec("UPDATE participants SET next_post_at=created_at");
  const safeDecision = await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "授業は分かりやすいです"
  });
  const comment = await persist(h, "translate-mask", "授業は分かりやすいです", safeDecision, h.now + 40_000);
  const translatedDecision = await evaluateTranslationFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    translatedText: "you are an asshole", targetLanguage: "en"
  });
  check("translated English text is checked by the English pack", translatedDecision.action === "mask" && translatedDecision.displayMessage && !translatedDecision.displayMessage.includes("asshole"), translatedDecision);
  const job = await insertProcessingTranslationJob(h, comment.id, "en", h.now + 40_100);
  const event = await completeTranslationJob(h.db, {
    job, translatedText: "you are an asshole", filterDecision: translatedDecision,
    provider: "test", model: "test-model", promptVersion: "test-v1", outputCharacters: 18,
    now: h.now + 40_200
  });
  const stored = h.row("SELECT translated_text,display_text,filter_action FROM translations WHERE comment_id=?1", comment.id);
  check("raw translation and filtered display translation are stored separately", stored?.translated_text === "you are an asshole" && stored.filter_action === "mask" && stored.display_text !== stored.translated_text, stored);
  const realtime = h.row("SELECT payload_json FROM realtime_events WHERE id=?1", event.id);
  check("translation realtime never leaks the unfiltered translation", realtime && !realtime.payload_json.includes("asshole") && JSON.parse(realtime.payload_json).translation === stored.display_text, realtime);

  h.exec("UPDATE participants SET next_post_at=created_at");
  const second = await persist(h, "translate-hold", "もう一つのコメント", await evaluateCommentFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId, message: "もう一つのコメント"
  }), h.now + 60_000);
  const rejectDecision = await evaluateTranslationFilter(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    translatedText: "I will kill you", targetLanguage: "en"
  });
  check("high-severity translated text is rejected from display", rejectDecision.action === "reject", rejectDecision);
  const secondJob = await insertProcessingTranslationJob(h, second.id, "en", h.now + 60_100);
  const noEvent = await completeTranslationJob(h.db, {
    job: secondJob, translatedText: "I will kill you", filterDecision: rejectDecision,
    provider: "test", model: "test-model", promptVersion: "test-v1", outputCharacters: 15,
    now: h.now + 60_200
  });
  const held = h.row("SELECT display_text,filter_action FROM translations WHERE comment_id=?1", second.id);
  check("rejected translation is held and no realtime event is created", noEvent === null && held?.display_text == null && held.filter_action === "reject" && !h.row("SELECT id FROM realtime_events WHERE source_comment_id=?1 AND payload_json LIKE '%translation:ready%'", second.id), held);
}

async function enableStandardPolicies(h) {
  const levels = {
    sexual: [2, 3, 5], profanity: [2, 3, 5], harassment: [3, 4, 5],
    discrimination: [2, 4, 5], violence: [3, 4, 5], personal_info: [1, 2, 5],
    spam: [2, 3, 5], illegal: [3, 4, 5], custom: [3, 4, 5]
  };
  const current = (await listOrganizationFilter(h.db, "org_a")).policies;
  await updateFilterPolicies(h.db, {
    organizationId: "org_a", actorUserId: "usr_owner_a", now: h.now + 50,
    policies: current.map((policy) => {
      const value = levels[policy.category];
      return {
        category: policy.category, enabled: Boolean(value),
        reviewMinSeverity: value?.[0] ?? policy.reviewMinSeverity,
        maskMinSeverity: value?.[1] ?? policy.maskMinSeverity,
        rejectMinSeverity: value?.[2] ?? policy.rejectMinSeverity
      };
    })
  });
}

async function persist(h, suffix, message, filterDecision, now) {
  const result = await persistComment(h.db, {
    organizationId: "org_a", liveSessionId: h.sessionId,
    participantTokenHash: `bilingual_participant_${suffix}`,
    idempotencyKey: `bilingual_${suffix}_${now}`,
    nickname: suffix, message, messageLength: Array.from(message).length,
    retentionDays: 30, filterDecision, now
  });
  return result.comment;
}

async function insertProcessingTranslationJob(h, commentId, targetLanguage, now) {
  const id = makeId("aij");
  const nowIso = new Date(now).toISOString();
  h.run(
    `INSERT INTO ai_jobs (id,organization_id,live_session_id,comment_id,job_type,target_language,status,attempt_count,run_after,claimed_at,finished_at,last_error_code,created_at,updated_at)
     VALUES (?1,'org_a',?2,?3,'translation',?4,'processing',1,?5,?5,NULL,NULL,?5,?5)`,
    id, h.sessionId, commentId, targetLanguage, nowIso
  );
  return h.row("SELECT j.*,c.detected_language FROM ai_jobs j JOIN comments c ON c.id=j.comment_id WHERE j.id=?1", id);
}

function createHarness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  const migrations = [
    "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
    "0004_precision_hardening.sql", "0005_comment_content_guards.sql",
    "0006_manual_moderation.sql", "0007_realtime.sql", "0008_email_auth.sql",
    "0009_account_lifecycle.sql", "0010_ai_moderation_translation.sql",
    "0011_dictionary_content_filter.sql", "0012_multilingual_filter_usability.sql",
    "0013_bilingual_filter_translation_safety.sql",
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
    run: (sql, ...values) => runStatement(sqlite.prepare(sql), values, sql),
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
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

await main();
