import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateFilterMessage } from "../src/content-filter/matcher.js";
import { issueSessionCsrfToken, isValidSecondaryCsrfToken } from "../src/auth/csrf-tokens.js";
import { checkRateLimit } from "../src/auth/rate-limit.js";
import { hashToken } from "../src/auth/passwords.js";
import { consumePublicEmailRateLimit } from "../src/auth/public-auth-rate.js";

class D1DatabaseAdapter {
  constructor(database) { this.database = database; }
  prepare(sql) { return new D1PreparedAdapter(this.database, sql); }
  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const output = statements.map((statement) => statement.executeRun());
      this.database.exec("COMMIT;");
      return output;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
class D1PreparedAdapter {
  constructor(database, sql, values = []) { this.database = database; this.sql = sql; this.values = values; }
  bind(...values) { return new D1PreparedAdapter(this.database, this.sql, values); }
  async first(column) { const row = this.executeGet(); return column ? row?.[column] ?? null : row ?? null; }
  async all() { return { success: true, results: this.executeAll(), meta: {} }; }
  async run() { return this.executeRun(); }
  executeGet() { return statementGet(this.database.prepare(this.sql), this.sql, this.values); }
  executeAll() { return statementAll(this.database.prepare(this.sql), this.sql, this.values); }
  executeRun() {
    const result = statementRun(this.database.prepare(this.sql), this.sql, this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes || 0), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}
function parameters(sql, values) {
  const indexes = [...sql.matchAll(/\?(\d+)/g)].map((match) => Number(match[1]));
  if (!indexes.length) return null;
  return Object.fromEntries([...new Set(indexes)].map((index) => [String(index), values[index - 1] ?? null]));
}
function statementRun(statement, sql, values) { const params = parameters(sql, values); return params ? statement.run(params) : statement.run(...values); }
function statementGet(statement, sql, values) { const params = parameters(sql, values); return params ? statement.get(params) : statement.get(...values); }
function statementAll(statement, sql, values) { const params = parameters(sql, values); return params ? statement.all(params) : statement.all(...values); }

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const sqlite = new DatabaseSync(":memory:");
sqlite.exec("PRAGMA foreign_keys=ON;");
for (const name of readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => name.endsWith(".sql")).sort()) {
  sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
}
const db = new D1DatabaseAdapter(sqlite);
const now = Date.now();
const createdAt = new Date(now - 60_000).toISOString();
const future = new Date(now + 12 * 60 * 60 * 1000).toISOString();
const retained = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();
seed();

const migration0017 = readFileSync(resolve(ROOT, "migrations-v2/0017_final_integrity_hardening.sql"), "utf8");
const requiredHardeningTriggers = [...migration0017.matchAll(/^CREATE TRIGGER\s+(\S+)/gm)]
  .map((match) => match[1])
  .filter((name) => !name.startsWith("trg_migration_0017_"));
check("all migrations through 0017 apply", requiredHardeningTriggers.length === 42);
check("all persistent Stage 8.2 triggers exist", requiredHardeningTriggers.every((name) => scalar(`SELECT COUNT(*) FROM sqlite_master WHERE type='trigger' AND name='${name}'`) === 1));
check("full schema foreign keys are clean", rows("PRAGMA foreign_key_check").length === 0);
check("full schema integrity is ok", scalar("PRAGMA integrity_check") === "ok");

expectSqlFailure("cross-organization audit actor is rejected", `
  INSERT INTO audit_logs (id,organization_id,actor_type,actor_user_id,actor_role,action,target_type,target_id,details_json,created_at)
  VALUES ('aud_cross','org_a','user','usr_b','owner','test.cross','x','x',NULL,'${createdAt}')`, "ORG_BOUNDARY_AUDIT_ACTOR");
expectSqlFailure("cross-organization filter creator is rejected", `
  INSERT INTO content_filter_terms (id,organization_id,term,normalized_term,compact_term,category,severity,match_mode,fuzzy_enabled,active,created_by_user_id,created_at,updated_at,deleted_at,language_code,boundary_mode)
  VALUES ('term_cross','org_a','cross','cross','cross','custom',3,'normalized',0,1,'usr_b','${createdAt}','${createdAt}',NULL,'en','word')`, "ORG_BOUNDARY_FILTER_TERM_CREATOR");
expectSqlFailure("cross-organization realtime ticket is rejected", `
  INSERT INTO realtime_connection_tickets (id,token_hash,organization_id,live_session_id,user_id,auth_session_id,role,last_sequence,issued_at,expires_at,consumed_at)
  VALUES ('ticket_cross_user','${"a".repeat(64)}','org_a','sess_a','usr_b','auth_a','owner',0,'${createdAt}','${future}',NULL)`, "ORG_BOUNDARY_REALTIME_");
expectSqlFailure("realtime ticket auth context mismatch is rejected", `
  INSERT INTO realtime_connection_tickets (id,token_hash,organization_id,live_session_id,user_id,auth_session_id,role,last_sequence,issued_at,expires_at,consumed_at)
  VALUES ('ticket_cross_auth','${"b".repeat(64)}','org_a','sess_a','usr_a','auth_b','owner',0,'${createdAt}','${future}',NULL)`, "ORG_BOUNDARY_REALTIME_AUTH_SESSION");
expectSqlFailure("cross-session realtime source comment is rejected", `
  INSERT INTO realtime_events (id,organization_id,live_session_id,sequence,event_type,payload_json,source_comment_id,created_at,expires_at)
  VALUES ('evt_cross','org_a','sess_a',999,'message:new','{}','cmt_b','${createdAt}','${future}')`, "ORG_BOUNDARY_REALTIME_SOURCE_COMMENT");
expectSqlFailure("cross-organization filter evidence is rejected", `
  INSERT INTO comment_filter_matches (id,organization_id,live_session_id,comment_id,term_id,category,severity,match_kind,confidence_milli,obfuscation_score,span_start,span_end,created_at)
  VALUES ('match_cross','org_a','sess_a','cmt_a','term_b','custom',3,'strict',1000,0,0,1,'${createdAt}')`, "ORG_BOUNDARY_FILTER_MATCH_TERM");
expectSqlFailure("AI result job context mismatch is rejected", `
  INSERT INTO ai_results (id,job_id,organization_id,live_session_id,comment_id,recommendation,confidence_milli,categories_json,source,provider,model,prompt_version,created_at)
  VALUES ('res_cross','job_mod_b','org_a','sess_a','cmt_a','allow',900,'[]','provider','test','test','v1','${createdAt}')`, "ORG_BOUNDARY_AI_RESULT_JOB");
expectSqlFailure("translation job context mismatch is rejected", `
  INSERT INTO translations (id,job_id,organization_id,live_session_id,comment_id,target_language,translated_text,provider,model,prompt_version,created_at,source_language,display_text,filter_action,filter_matches_json,filter_version)
  VALUES ('tr_cross','job_tr_b','org_a','sess_a','cmt_a','ja','x','test','test','v1','${createdAt}','en','x','allow','[]',1)`, "ORG_BOUNDARY_TRANSLATION_JOB");
expectSqlFailure("AI usage cannot be charged to another organization", `
  INSERT INTO ai_usage_events (id,organization_id,job_id,attempt_number,job_type,provider,model,day_key,input_characters,output_characters,created_at,updated_at)
  VALUES ('use_cross','org_a','job_mod_b',1,'moderation','test','test','2026-07-17',1,1,'${createdAt}','${createdAt}')`, "ORG_BOUNDARY_AI_USAGE_JOB");

expectSqlFailure("audit actor boundary is enforced on update", `
  UPDATE audit_logs SET actor_user_id='usr_b' WHERE id='aud_valid'`, "ORG_BOUNDARY_AUDIT_ACTOR");
expectSqlFailure("filter creator boundary is enforced on update", `
  UPDATE content_filter_terms SET created_by_user_id='usr_b' WHERE id='term_a'`, "ORG_BOUNDARY_FILTER_TERM_CREATOR");
expectSqlFailure("realtime ticket boundary is enforced on update", `
  UPDATE realtime_connection_tickets SET user_id='usr_b' WHERE id='ticket_valid'`, "ORG_BOUNDARY_REALTIME_");
expectSqlFailure("AI result context is enforced on update", `
  UPDATE ai_results SET organization_id='org_b' WHERE id='res_valid'`, "ORG_BOUNDARY_AI_RESULT_JOB");
expectSqlFailure("translation context is enforced on update", `
  UPDATE translations SET organization_id='org_b' WHERE id='tr_valid'`, "ORG_BOUNDARY_TRANSLATION_JOB");
expectSqlFailure("AI usage context is enforced on update", `
  UPDATE ai_usage_events SET organization_id='org_b' WHERE id='use_valid'`, "ORG_BOUNDARY_AI_USAGE_JOB");

expectSqlFailure("comment event actor boundary is enforced", `
  UPDATE comment_events SET actor_user_id='usr_b' WHERE id='cev_valid'`, "ORG_BOUNDARY_COMMENT_EVENT_ACTOR");
expectSqlFailure("moderation action actor boundary is enforced", `
  UPDATE comment_moderation_actions SET actor_user_id='usr_b' WHERE id='mod_valid'`, "ORG_BOUNDARY_MODERATION_ACTOR");
expectSqlFailure("moderation setting updater boundary is enforced", `
  UPDATE session_moderation_settings SET updated_by_user_id='usr_b' WHERE organization_id='org_a' AND live_session_id='sess_a'`, "ORG_BOUNDARY_MODERATION_UPDATER");
expectSqlFailure("organization filter policy updater boundary is enforced", `
  UPDATE organization_content_filter_policies SET updated_by_user_id='usr_b' WHERE organization_id='org_a' AND category='custom'`, "ORG_BOUNDARY_FILTER_POLICY_UPDATER");
expectSqlFailure("session filter updater boundary is enforced", `
  UPDATE session_content_filter_settings SET updated_by_user_id='usr_b' WHERE organization_id='org_a' AND live_session_id='sess_a'`, "ORG_BOUNDARY_SESSION_FILTER_UPDATER");
expectSqlFailure("filter pack installer boundary is enforced", `
  UPDATE content_filter_pack_installs SET installed_by_user_id='usr_b' WHERE organization_id='org_a' AND pack_id='test-pack'`, "ORG_BOUNDARY_FILTER_PACK_INSTALLER");
expectSqlFailure("organization AI updater boundary is enforced", `
  UPDATE organization_ai_settings SET updated_by_user_id='usr_b' WHERE organization_id='org_a'`, "ORG_BOUNDARY_AI_ORG_UPDATER");
expectSqlFailure("session AI updater boundary is enforced", `
  UPDATE session_ai_settings SET updated_by_user_id='usr_b' WHERE organization_id='org_a' AND live_session_id='sess_a'`, "ORG_BOUNDARY_AI_SESSION_UPDATER");
expectSqlFailure("organization origin creator boundary is enforced", `
  UPDATE organization_origins SET created_by_user_id='usr_b' WHERE organization_id='org_a'`, "ORG_BOUNDARY_ORIGIN_CREATOR");
expectSqlFailure("PDF creator boundary is enforced", `
  UPDATE pdf_documents SET created_by_user_id='usr_b' WHERE id='pdf_valid'`, "ORG_BOUNDARY_PDF_CREATOR");
expectSqlFailure("invitation acceptor boundary is enforced", `
  UPDATE organization_invitations SET accepted_user_id='usr_b' WHERE id='inv_valid'`, "ORG_BOUNDARY_INVITATION_ACCEPTOR");

const reviewTerms = Array.from({ length: 100 }, (_, index) => term(`r${index}`, `w${index}`, "custom", 3));
const rejectTerm = term("reject", "blocked", "violence", 5);
const decision = evaluateFilterMessage(`${reviewTerms.map((item) => item.compactTerm).join(" ")} blocked`, {
  settings: { enabled: true, maskCharacter: "＊", aiRoutingMode: "ambiguous" },
  policies: [
    { category: "custom", enabled: true, reviewMinSeverity: 1, maskMinSeverity: null, rejectMinSeverity: null },
    { category: "violence", enabled: true, reviewMinSeverity: 1, maskMinSeverity: 4, rejectMinSeverity: 5 }
  ],
  terms: [...reviewTerms, rejectTerm],
  version: 1
});
check("reject terms after the 100-result evidence cap are still enforced", decision.action === "reject" && decision.matches.some((item) => item.termId === "reject"));
check("filter response evidence remains capped", decision.matches.length === 100);

const fixedNow = new Date(now);
const issued = [];
for (let index = 0; index < 10; index += 1) {
  issued.push(await issueSessionCsrfToken(db, "auth_a", future, fixedNow));
}
check("secondary CSRF storage remains capped at eight", scalar("SELECT COUNT(*) FROM auth_session_csrf_tokens WHERE auth_session_id='auth_a'") === 8);
const issuedHashes = await Promise.all(issued.map((item) => hashToken(item.rawToken)));
const newestTokenValidity = await Promise.all(issuedHashes.slice(2).map((hash) => isValidSecondaryCsrfToken(db, "auth_a", hash, fixedNow)));
const oldestTokenValidity = await Promise.all(issuedHashes.slice(0, 2).map((hash) => isValidSecondaryCsrfToken(db, "auth_a", hash, fixedNow)));
check("the eight most recently issued same-timestamp CSRF tokens remain valid", newestTokenValidity.every(Boolean), JSON.stringify({ newestTokenValidity, rows: rows("SELECT rowid,id,token_hash,created_at FROM auth_session_csrf_tokens WHERE auth_session_id=\'auth_a\' ORDER BY rowid") }));
check("same-timestamp CSRF eviction removes only the first two insertions", oldestTokenValidity.every((value) => !value));

const unavailable = await checkRateLimit({ limit: async () => { throw new Error("down"); } }, "key");
check("rate limiter exceptions fail closed", unavailable.success === false && unavailable.unavailable === true);

sqlite.exec(`CREATE TRIGGER fail_ip_counter BEFORE INSERT ON auth_public_counters WHEN NEW.scope='request_ip' BEGIN SELECT RAISE(ABORT,'forced counter failure'); END;`);
let quotaFailure = false;
try {
  await consumePublicEmailRateLimit(new Request("https://example.test/api", { headers: { "cf-connecting-ip": "203.0.113.5" } }), {
    APP_ENV: "local",
    AUTH_RATE_LIMIT_PEPPER: "hardening-test-pepper",
    AUTH_PUBLIC_EMAIL_LIMITER: { limit: async () => ({ success: true }) },
    DB_V2: db
  }, "atomic@example.test", "test");
} catch {
  quotaFailure = true;
}
check("public email counter batch reports a forced failure", quotaFailure);
check("recipient counter is rolled back when IP counter fails", scalar("SELECT COUNT(*) FROM auth_public_counters") === 0);
sqlite.exec("DROP TRIGGER fail_ip_counter;");

const privateSource = readFileSync(resolve(ROOT, "src/routes/private-v2.js"), "utf8");
check("teacher API does not fabricate user.local addresses", !privateSource.includes("@user.local") && privateSource.includes("email: auth.email || null"));

const passed = results.filter((item) => item.ok).length;
const failed = results.length - passed;
console.log(`\nFinal hardening regression summary: ${passed} passed, ${failed} failed, ${results.length} total.`);
sqlite.close();
if (failed) process.exitCode = 1;

function seed() {
  sqlite.exec(`
    INSERT INTO organizations VALUES
      ('org_a','Organization A','active','${createdAt}','${createdAt}',NULL),
      ('org_b','Organization B','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO users (id,login_id,display_name,password_scheme,password_hash,password_salt,password_changed_at,status,created_at,updated_at,deleted_at,failed_login_count,locked_until,require_password_change,email,email_verified_at,email_updated_at) VALUES
      ('usr_a','user.a','User A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,'a@example.test','${createdAt}','${createdAt}'),
      ('usr_b','user.b','User B','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${createdAt}','active','${createdAt}','${createdAt}',NULL,0,NULL,0,'b@example.test','${createdAt}','${createdAt}');
    INSERT INTO organization_members VALUES
      ('org_a','usr_a','owner','active','${createdAt}','${createdAt}',NULL),
      ('org_b','usr_b','owner','active','${createdAt}','${createdAt}',NULL);
    INSERT INTO auth_sessions VALUES
      ('auth_a','org_a','usr_a','${"1".repeat(64)}','${"2".repeat(64)}','${createdAt}','${createdAt}','${future}','${future}',NULL),
      ('auth_b','org_b','usr_b','${"3".repeat(64)}','${"4".repeat(64)}','${createdAt}','${createdAt}','${future}','${future}',NULL);
    INSERT INTO live_sessions VALUES
      ('sess_a','org_a','usr_a','ABC234','Session A',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${future}',NULL,NULL),
      ('sess_b','org_b','usr_b','DEF567','Session B',1,1,60,'stack3','active','${createdAt}','${createdAt}','${createdAt}','${future}',NULL,NULL);
    INSERT INTO participants VALUES
      ('part_a','org_a','sess_a','${"5".repeat(64)}','active',NULL,'${createdAt}','${createdAt}','${createdAt}',NULL),
      ('part_b','org_b','sess_b','${"6".repeat(64)}','active',NULL,'${createdAt}','${createdAt}','${createdAt}',NULL);
    INSERT INTO comments (id,organization_id,live_session_id,participant_id,idempotency_key,nickname,message,message_length,moderation_state,created_at,updated_at,retained_until,deleted_at) VALUES
      ('cmt_a','org_a','sess_a','part_a','idempotency_key_a','a','a',1,'visible','${createdAt}','${createdAt}','${retained}',NULL),
      ('cmt_b','org_b','sess_b','part_b','idempotency_key_b','b','b',1,'visible','${createdAt}','${createdAt}','${retained}',NULL);
    INSERT INTO content_filter_terms (id,organization_id,term,normalized_term,compact_term,category,severity,match_mode,fuzzy_enabled,active,created_by_user_id,created_at,updated_at,deleted_at,language_code,boundary_mode) VALUES
      ('term_a','org_a','a','a','a','custom',3,'normalized',0,1,'usr_a','${createdAt}','${createdAt}',NULL,'en','word'),
      ('term_b','org_b','b','b','b','custom',3,'normalized',0,1,'usr_b','${createdAt}','${createdAt}',NULL,'en','word');
    INSERT INTO ai_jobs (id,organization_id,live_session_id,comment_id,job_type,target_language,status,attempt_count,run_after,claimed_at,finished_at,last_error_code,created_at,updated_at) VALUES
      ('job_mod_a','org_a','sess_a','cmt_a','moderation','','processing',1,'${createdAt}','${createdAt}',NULL,NULL,'${createdAt}','${createdAt}'),
      ('job_mod_b','org_b','sess_b','cmt_b','moderation','','processing',1,'${createdAt}','${createdAt}',NULL,NULL,'${createdAt}','${createdAt}'),
      ('job_tr_a','org_a','sess_a','cmt_a','translation','ja','processing',1,'${createdAt}','${createdAt}',NULL,NULL,'${createdAt}','${createdAt}'),
      ('job_tr_b','org_b','sess_b','cmt_b','translation','ja','processing',1,'${createdAt}','${createdAt}',NULL,NULL,'${createdAt}','${createdAt}');
    INSERT INTO audit_logs (id,organization_id,actor_type,actor_user_id,actor_role,action,target_type,target_id,details_json,created_at)
      VALUES ('aud_valid','org_a','user','usr_a','owner','test.valid','x','x',NULL,'${createdAt}');
    INSERT INTO comment_events (id,organization_id,live_session_id,comment_id,event_type,actor_type,actor_user_id,details_json,created_at)
      VALUES ('cev_valid','org_a','sess_a','cmt_a','hidden','user','usr_a',NULL,'${createdAt}');
    INSERT INTO session_moderation_settings (organization_id,live_session_id,moderation_mode,updated_by_user_id,created_at,updated_at)
      VALUES ('org_a','sess_a','off','usr_a','${createdAt}','${createdAt}');
    INSERT INTO comment_moderation_actions (id,organization_id,live_session_id,comment_id,actor_user_id,actor_role,action,from_state,to_state,reason,expected_updated_at,result_updated_at,created_at)
      VALUES ('mod_valid','org_a','sess_a','cmt_a','usr_a','owner','hide','visible','hidden',NULL,'${new Date(Date.parse(createdAt)-1000).toISOString()}','${createdAt}','${createdAt}');
    UPDATE organization_content_filter_policies SET updated_by_user_id='usr_a', updated_at='${createdAt}' WHERE organization_id='org_a' AND category='custom';
    UPDATE session_content_filter_settings SET updated_by_user_id='usr_a', updated_at='${createdAt}' WHERE organization_id='org_a' AND live_session_id='sess_a';
    INSERT INTO content_filter_pack_installs (organization_id,pack_id,pack_version,installed_by_user_id,installed_at,updated_at)
      VALUES ('org_a','test-pack',1,'usr_a','${createdAt}','${createdAt}');
    UPDATE organization_ai_settings SET updated_by_user_id='usr_a', updated_at='${createdAt}' WHERE organization_id='org_a';
    UPDATE session_ai_settings SET updated_by_user_id='usr_a', updated_at='${createdAt}' WHERE organization_id='org_a' AND live_session_id='sess_a';
    INSERT INTO organization_origins (organization_id,source,created_by_user_id,created_at)
      VALUES ('org_a','system','usr_a','${createdAt}');
    INSERT INTO pdf_documents (id,organization_id,sha256_hex,pdfjs_fingerprint,page_count,file_size_bytes,created_by_user_id,created_at,last_seen_at)
      VALUES ('pdf_valid','org_a','${"8".repeat(64)}','fingerprint-valid',1,1024,'usr_a','${createdAt}','${createdAt}');
    INSERT INTO organization_invitations (id,organization_id,email,role,token_hash,invited_by_user_id,created_at,expires_at,accepted_at,accepted_user_id,revoked_at,last_sent_at,resend_count)
      VALUES ('inv_valid','org_a','a@example.test','teacher','${"9".repeat(64)}','usr_a','${createdAt}','${future}','${createdAt}','usr_a',NULL,'${createdAt}',0);
    INSERT INTO realtime_connection_tickets (id,token_hash,organization_id,live_session_id,user_id,auth_session_id,role,last_sequence,issued_at,expires_at,consumed_at)
      VALUES ('ticket_valid','${"7".repeat(64)}','org_a','sess_a','usr_a','auth_a','owner',0,'${createdAt}','${future}',NULL);
    INSERT INTO ai_results (id,job_id,organization_id,live_session_id,comment_id,recommendation,confidence_milli,categories_json,source,provider,model,prompt_version,created_at)
      VALUES ('res_valid','job_mod_a','org_a','sess_a','cmt_a','allow',900,'[]','provider','test','test','v1','${createdAt}');
    INSERT INTO translations (id,job_id,organization_id,live_session_id,comment_id,target_language,translated_text,provider,model,prompt_version,created_at,source_language,display_text,filter_action,filter_matches_json,filter_version)
      VALUES ('tr_valid','job_tr_a','org_a','sess_a','cmt_a','ja','x','test','test','v1','${createdAt}','en','x','allow','[]',1);
    INSERT INTO ai_usage_events (id,organization_id,job_id,attempt_number,job_type,provider,model,day_key,input_characters,output_characters,created_at,updated_at)
      VALUES ('use_valid','org_a','job_mod_a',1,'moderation','test','test','2026-07-17',1,1,'${createdAt}','${createdAt}');
  `);
}

function term(id, compactTerm, category, severity) {
  return {
    id, normalizedTerm: compactTerm, compactTerm, category, severity,
    matchMode: "normalized", fuzzyEnabled: false, languageCode: "en", boundaryMode: "word"
  };
}
function check(name, ok, details) {
  results.push({ name, ok: Boolean(ok) });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && details !== undefined) console.log(details);
}
function expectSqlFailure(name, sql, marker) {
  try {
    sqlite.exec(sql);
    check(name, false, "statement succeeded");
  } catch (error) {
    check(name, String(error?.message || error).includes(marker), String(error?.message || error));
  }
}
function rows(sql) { return sqlite.prepare(sql).all(); }
function scalar(sql) {
  const row = sqlite.prepare(sql).get();
  return row ? Object.values(row)[0] : null;
}
