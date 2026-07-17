import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { installFilterPack, listOrganizationFilter } from "../src/content-filter/repository.js";
import { getBuiltInFilterPack } from "../src/content-filter/packs.js";
import { normalizeFilterTerm } from "../src/content-filter/normalization.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
function check(name, condition, detail = "") {
  const ok = Boolean(condition); results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

async function main() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  try {
    for (const name of [
      "0001_initial_schema.sql", "0002_auth_security.sql", "0003_comments.sql",
      "0004_precision_hardening.sql", "0005_comment_content_guards.sql", "0006_manual_moderation.sql",
      "0007_realtime.sql", "0008_email_auth.sql", "0009_account_lifecycle.sql",
      "0010_ai_moderation_translation.sql", "0011_dictionary_content_filter.sql",
      "0012_multilingual_filter_usability.sql", "0013_bilingual_filter_translation_safety.sql",
      "0014_filter_pack_expansion.sql"
    ]) sqlite.exec(readFileSync(resolve(ROOT, "migrations-v2", name), "utf8"));
    const now = Date.now();
    const stamp = new Date(now - 60_000).toISOString();
    sqlite.exec(`
      INSERT INTO organizations (id,name,status,created_at,updated_at,deleted_at) VALUES ('org_a','Organization A','active','${stamp}','${stamp}',NULL);
      INSERT INTO users (id,login_id,display_name,password_scheme,password_hash,password_salt,password_changed_at,status,created_at,updated_at,deleted_at,failed_login_count,locked_until,require_password_change,email,email_verified_at,email_updated_at)
        VALUES ('usr_owner_a','owner.a','Owner A','test','AAAAAAAAAAAAAAAA','BBBBBBBB','${stamp}','active','${stamp}','${stamp}',NULL,0,NULL,0,'owner@example.test','${stamp}','${stamp}');
      INSERT INTO organization_members (organization_id,user_id,role,status,created_at,updated_at,removed_at) VALUES ('org_a','usr_owner_a','owner','active','${stamp}','${stamp}',NULL);
    `);
    const db = new D1DatabaseAdapter(sqlite);
    const ja = getBuiltInFilterPack("ja-core-v1");
    seedPackRow(sqlite, ja.terms.find((term) => term.key === "ja-001"), { id: "legacy_001", severity: 3, sourceVersion: 1, stamp });
    seedPackRow(sqlite, ja.terms.find((term) => term.key === "ja-007"), { id: "legacy_007", severity: 3, sourceVersion: 1, stamp });
    seedPackRow(sqlite, ja.terms.find((term) => term.key === "ja-024"), { id: "legacy_deleted", severity: 5, sourceVersion: 1, stamp, deleted: true });
    const manual = normalizeFilterTerm("手動編集語");
    sqlite.prepare(`INSERT INTO content_filter_terms (
      id,organization_id,term,normalized_term,compact_term,category,severity,match_mode,fuzzy_enabled,language_code,boundary_mode,active,
      created_by_user_id,created_at,updated_at,deleted_at,source_pack,source_pack_version,source_pack_term_key
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "manual_1", "org_a", manual.term, manual.normalizedTerm, manual.compactTerm, "custom", 4, "normalized", 0, "ja", "substring", 1,
      "usr_owner_a", stamp, stamp, null, null, null, null
    );
    sqlite.prepare(`INSERT INTO content_filter_pack_installs (organization_id,pack_id,pack_version,installed_by_user_id,installed_at,updated_at) VALUES (?,?,?,?,?,?)`)
      .run("org_a", "ja-core-v1", 1, "usr_owner_a", stamp, stamp);

    const before = await listOrganizationFilter(db, "org_a");
    check("legacy version 1 install is detected", before.packs.find((pack) => pack.id === "ja-core-v1")?.installedVersion === 1);
    await installFilterPack(db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "ja-core-v1", now });
    const after = await listOrganizationFilter(db, "org_a");
    const installed = after.packs.find((pack) => pack.id === "ja-core-v1");
    check("pack installation upgrades version 1 to version 2", installed?.installedVersion === 2, installed);
    const upgraded007 = one(sqlite, "SELECT id,severity,source_pack_version,deleted_at FROM content_filter_terms WHERE organization_id='org_a' AND source_pack='ja-core-v1' AND source_pack_term_key='ja-007'");
    check("untouched pack-managed term is updated in place", upgraded007?.id === "legacy_007" && upgraded007.severity === 1 && upgraded007.source_pack_version === 2 && !upgraded007.deleted_at, upgraded007);
    const deleted024 = one(sqlite, "SELECT id,deleted_at FROM content_filter_terms WHERE organization_id='org_a' AND source_pack='ja-core-v1' AND source_pack_term_key='ja-024'");
    check("deleted pack term remains deleted after upgrade", deleted024?.id === "legacy_deleted" && Boolean(deleted024.deleted_at), deleted024);
    check("deleted pack term is not resurrected as a second row", all(sqlite, "SELECT id FROM content_filter_terms WHERE organization_id='org_a' AND source_pack='ja-core-v1' AND source_pack_term_key='ja-024'").length === 1);
    const manualAfter = one(sqlite, "SELECT term,severity,source_pack FROM content_filter_terms WHERE id='manual_1'");
    check("manually created or detached terms are preserved", manualAfter?.term === "手動編集語" && manualAfter.severity === 4 && manualAfter.source_pack == null, manualAfter);
    const activePackCount = Number(one(sqlite, "SELECT COUNT(*) AS count FROM content_filter_terms WHERE organization_id='org_a' AND source_pack='ja-core-v1' AND deleted_at IS NULL")?.count || 0);
    check("upgrade installs every non-deleted pack term", activePackCount === ja.terms.length - 1, { activePackCount, expected: ja.terms.length - 1 });

    const countBeforeRepeat = Number(one(sqlite, "SELECT COUNT(*) AS count FROM content_filter_terms")?.count || 0);
    await installFilterPack(db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "ja-core-v1", now: now + 1 });
    const countAfterRepeat = Number(one(sqlite, "SELECT COUNT(*) AS count FROM content_filter_terms")?.count || 0);
    check("reinstalling version 2 is idempotent", countAfterRepeat === countBeforeRepeat, { countBeforeRepeat, countAfterRepeat });

    const context = getBuiltInFilterPack("ja-context-v1");
    await installFilterPack(db, { organizationId: "org_a", actorUserId: "usr_owner_a", packId: "ja-context-v1", now: now + 2 });
    const contextCount = Number(one(sqlite, "SELECT COUNT(*) AS count FROM content_filter_terms WHERE organization_id='org_a' AND source_pack='ja-context-v1' AND deleted_at IS NULL")?.count || 0);
    check("context pack installs separately", contextCount === context.terms.length, { contextCount, expected: context.terms.length });
    const duplicateKeys = all(sqlite, `SELECT source_pack,source_pack_term_key,COUNT(*) AS count FROM content_filter_terms
      WHERE organization_id='org_a' AND source_pack IS NOT NULL GROUP BY source_pack,source_pack_term_key HAVING COUNT(*) > 1`);
    check("source pack keys remain unique", duplicateKeys.length === 0, duplicateKeys);
    const fk = all(sqlite, "PRAGMA foreign_key_check");
    check("pack upgrades preserve foreign-key integrity", fk.length === 0, fk);
    check("database quick_check remains ok", one(sqlite, "PRAGMA quick_check")?.quick_check === "ok", one(sqlite, "PRAGMA quick_check"));
  } finally {
    sqlite.close();
  }
}

function seedPackRow(sqlite, term, options) {
  const normalized = normalizeFilterTerm(term.term);
  sqlite.prepare(`INSERT INTO content_filter_terms (
    id,organization_id,term,normalized_term,compact_term,category,severity,match_mode,fuzzy_enabled,language_code,boundary_mode,active,
    created_by_user_id,created_at,updated_at,deleted_at,source_pack,source_pack_version,source_pack_term_key
  ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    options.id, "org_a", normalized.term, normalized.normalizedTerm, normalized.compactTerm, term.category, options.severity,
    term.matchMode, term.fuzzyEnabled ? 1 : 0, term.languageCode, term.boundaryMode, 1, "usr_owner_a", options.stamp, options.stamp,
    options.deleted ? options.stamp : null, "ja-core-v1", options.sourceVersion, term.key
  );
}
function one(sqlite, sql, ...values) { return sqlite.prepare(sql).get(...values) || null; }
function all(sqlite, sql, ...values) { return sqlite.prepare(sql).all(...values); }
class D1DatabaseAdapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) { return new D1PreparedAdapter(this.sqlite, sql); }
  async batch(statements) {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try { const output = statements.map((statement) => statement.executeRun()); this.sqlite.exec("COMMIT"); return output; }
    catch (error) { this.sqlite.exec("ROLLBACK"); throw error; }
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


await main();
const failed = results.filter((item) => !item.ok);
console.log(`\nStage 7.8 pack upgrade summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
