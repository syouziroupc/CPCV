import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
function check(name, condition, detail = "") {
  const ok = Boolean(condition);
  results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

const migrations = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
check("Stage 7.5 migration 0011 remains present", migrations.includes("0011_dictionary_content_filter.sql"), migrations);
const migration = text("migrations-v2/0011_dictionary_content_filter.sql");
for (const table of ["content_filter_terms", "organization_content_filter_policies", "session_content_filter_settings", "comment_filter_matches"]) {
  check(`dictionary table exists: ${table}`, migration.includes(`CREATE TABLE ${table}`));
}
check("original and display text are separate", migration.includes("ALTER TABLE comments ADD COLUMN display_message"));
check("filter defaults are disabled", migration.includes("enabled INTEGER NOT NULL DEFAULT 0"));
check("political policy starts disabled without mask/reject", migration.includes("'political', 0, 3, NULL, NULL"));
check("realtime uses display text", migration.includes("COALESCE(NEW.display_message, NEW.message)"));

const matcher = text("src/content-filter/matcher.js");
const normalization = text("src/content-filter/normalization.js");
const comments = text("src/comments/repository.js");
const room = text("src/realtime/comment-room.js");
const ai = text("src/ai/repository.js");
const routes = text("src/routes/content-filter.js");
const admin = text("public/assets/admin.js");
const join = text("public/assets/join.js");
check("NFKC normalization is applied", normalization.includes('.normalize("NFKC")'));
check("Katakana is folded to Hiragana", normalization.includes("katakanaToHiragana"));
check("punctuation insertion is compacted", normalization.includes("LETTER_NUMBER_OR_MARK") && normalization.includes("compactToOriginal"));
check("confusable matching is limited", normalization.includes("CONFUSABLE_MAP") && matcher.includes('matchKind: "confusable"'));
check("fuzzy matching is bounded", matcher.includes("MAX_FUZZY_CANDIDATES") && matcher.includes("boundedLevenshtein"));
check("ambiguous matches cannot directly reject", matcher.includes('action: "review"') && matcher.includes('ambiguous: true'));
check("exact filtering runs before persistence", /const filterDecision = await evaluateCommentFilter[\s\S]{0,500}const result = await persistComment/.test(room));
check("rejected comments are not persisted", room.includes('throw new AuthError(422, "CONTENT_REJECTED")'));
check("original message is retained", comments.includes("display_message") && comments.includes("input.message"));
check("match evidence is persisted atomically", comments.includes("filterMatchStatements") && comments.includes("db.batch(statements)"));
check("AI routing reads dictionary decision", ai.includes("filter_ai_required") && ai.includes("ai_routing_mode"));
check("organization dictionary API exists", routes.includes("/api/org/content-filter/terms") && routes.includes("/api/org/content-filter/policies"));
check("session filter API exists", routes.includes("updatePrivateSessionFilterSettings"));
check("term changes are audited without storing term text", routes.includes("content_filter.term.updated") && routes.includes("content_filter.term.deleted") && !routes.includes("details: { term:"));
check("admin UI manages terms and policy thresholds", admin.includes("loadOrganizationFilterSettings") && admin.includes("saveFilterPolicies") && admin.includes("saveSessionFilterSettings"));
check("student receives neutral rejection message", join.includes("CONTENT_REJECTED") && !join.includes("検閲用語"));
check("Stage 8 files remain absent", !readdirSync(resolve(ROOT, "migrations-v2")).some((name) => name.startsWith("0014_")));

const failed = results.filter((item) => !item.ok);
console.log(`\nStage 7.5 boundary summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
