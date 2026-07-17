import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const read = (path) => readFileSync(resolve(ROOT, path), "utf8");
const check = (name, condition, detail = "") => {
  const ok = Boolean(condition); results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
};

const migration = read("migrations-v2/0015_pdf_page_analytics.sql");
const hardeningMigration = read("migrations-v2/0016_stage08_precision_hardening.sql");
const finalHardeningMigration = read("migrations-v2/0017_final_integrity_hardening.sql");
const viewer = read("public/assets/viewer.js");
const join = read("public/assets/join.js");
const admin = read("public/assets/admin.js");
const privateRoutes = read("src/routes/private-v2.js");
const publicRoutes = read("src/routes/public-v2.js");
const repo = read("src/pdf-analysis/repository.js");
const comments = read("src/comments/repository.js");
const pkg = JSON.parse(read("package.json"));
const remoteVerifier = read("scripts/verify-remote-d1.mjs");

check("Stage 8 migration exists", existsSync(resolve(ROOT, "migrations-v2/0015_pdf_page_analytics.sql")));
check("Stage 8 precision migration exists", existsSync(resolve(ROOT, "migrations-v2/0016_stage08_precision_hardening.sql")));
check("PDF metadata stores SHA-256 and page count", /sha256_hex/.test(migration) && /page_count/.test(migration));
const migrationSql = migration.replace(/^--.*$/gm, "");
check("PDF metadata has no filename, page text, blob, or remote URL", !/file_?name|page_?text|\bblob\b|storage_url|remote_url/i.test(migrationSql), migrationSql.match(/file_?name|page_?text|\bblob\b|storage_url|remote_url/gi));
check("browser computes PDF SHA-256 locally", /crypto\.subtle\.digest\(['"]SHA-256/.test(viewer));
check("PDF bind request sends metadata only", /sha256Hex[\s\S]*pdfjsFingerprint[\s\S]*pageCount[\s\S]*fileSizeBytes/.test(viewer) && !/body:\s*JSON\.stringify\([\s\S]{0,500}(fileName|filename|bytes|pageText)/.test(viewer));
check("comments link to server current PDF page", /commentPageLinkStatement/.test(comments) && /server_current_page/.test(repo));
check("pre-Stage-8 comment compatibility is guarded", /tableExists\(db, ["']comment_page_links["']\)/.test(comments));
check("public understanding endpoint exists", /parts\[4\] === ["']understanding["']/.test(publicRoutes) && /persistUnderstandingSignal/.test(publicRoutes));
check("understanding uses three bounded signals", /understood/.test(migration) && /unsure/.test(migration) && /confused/.test(migration));
check("small-group suppression threshold is three", /MINIMUM_GROUP_SIZE\s*=\s*3/.test(repo));
check("analytics endpoints are session scoped", /sessions[\s\S]*analytics/.test(privateRoutes) && /liveSessionId:\s*session\.id/.test(read("src/routes/pdf-analysis.js")));
check("admin has aggregate analytics UI", /loadSessionAnalytics/.test(admin) && /createAnalyticsSnapshot/.test(admin) && /minimumGroupSize/.test(admin));
check("admin shows PDF page on comments", /PDF P\./.test(admin));
check("student UI exposes anonymous understanding controls", /understandingEnabled/.test(join) && /understanding-button/.test(read("public/j/index.html")));
check("analytics CSV does not export comment text or participant IDs", !/nickname|participant_id|message_text|comment_text/i.test(read("src/pdf-analysis/csv.js")));
check("no individual ranking or participant analytics API", !/leaderboard|ranking|participant-analytics|participants\/analytics/i.test(`${privateRoutes}\n${publicRoutes}\n${admin}`));
check("scheduled cleanup is migration-safe", /runPdfAnalyticsRetentionSafely/.test(read("src/index.js")) || /runPdfAnalyticsRetention/.test(read("src/index.js")));
check("package version is Stage 8.2 final hardening release", pkg.version === "0.8.2", pkg.version);
check("Stage 8 test command exists", pkg.scripts?.["db:v2:test:stage08"] === "node --no-warnings scripts/test-pdf-analysis-v2.mjs", pkg.scripts?.["db:v2:test:stage08"]);
check("Stage 8 aggregate runner exits explicitly", read("scripts/test-stage08-all.mjs").includes("process.exit(0)"));
check("remote verifier requires Stage 8 migrations", remoteVerifier.includes("0015_pdf_page_analytics") && remoteVerifier.includes("0016_stage08_precision_hardening") && remoteVerifier.includes("0017_final_integrity_hardening"));
check("remote verifier requires PDF analytics tables", ["pdf_documents", "session_pdf_state", "understanding_signals", "analytics_snapshots"].every((name) => remoteVerifier.includes(`"${name}"`)));

check("Stage 8 hardening migration protects PDF evidence relationships", [
  "trg_pdf_pages_document_bounds_insert",
  "trg_session_pdf_state_consistency_insert",
  "trg_understanding_signals_consistency_insert",
  "trg_analytics_snapshots_consistency_insert",
  "trg_pdf_page_events_immutable",
  "trg_comment_page_links_immutable",
  "trg_analytics_snapshots_immutable"
].every((name) => hardeningMigration.includes(name)));

check("Stage 8.2 hardening migration enforces critical context boundaries", [
  "trg_audit_logs_actor_org_insert",
  "trg_realtime_connection_tickets_auth_context_insert",
  "trg_realtime_events_source_comment_insert",
  "trg_comment_filter_matches_term_org_insert",
  "trg_ai_results_job_context_insert",
  "trg_translations_job_context_insert",
  "trg_ai_usage_events_job_context_insert",
  "trg_content_filter_terms_limit_insert"
].every((name) => finalHardeningMigration.includes(name)));
check("Stage 8.2 final hardening regression is part of aggregate test", read("scripts/test-stage08-all.mjs").includes("scripts/test-final-hardening.mjs") && pkg.scripts?.["test:final-hardening"] === "node --no-warnings scripts/test-final-hardening.mjs");
check("understanding retention is fixed independently from comment retention", /UNDERSTANDING_RETENTION_DAYS\s*=\s*180/.test(repo) && !/input\.retentionDays/.test(repo));
check("snapshot reads verify retention and checksum", /retained_until >/.test(repo) && /ANALYTICS_SNAPSHOT_CORRUPT/.test(repo));
check("overall suppression uses distinct respondents", /COUNT\(DISTINCT participant_id\) AS respondent_count/.test(repo));
check("same PDF binding is idempotent", /reused:\s*true/.test(repo));
check("viewer guards concurrent PDF loads", /pdfLoadRequest/.test(viewer) && /AbortController/.test(viewer));

const failed = results.filter((item) => !item.ok);
console.log(`\nStage 8 boundary summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
