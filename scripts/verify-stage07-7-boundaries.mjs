import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
function check(name, condition, detail = "") {
  const ok = Boolean(condition); results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}

const migrations = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
check("Stage 7.7 migration remains present before later stages", migrations.includes("0013_bilingual_filter_translation_safety.sql") && migrations.indexOf("0013_bilingual_filter_translation_safety.sql") < migrations.indexOf("0014_filter_pack_expansion.sql"), migrations);
const migration = text("migrations-v2/0013_bilingual_filter_translation_safety.sql");
check("comment language metadata is added", migration.includes("detected_language") && migration.includes("unsupported_language"));
check("translation filtering metadata is added", migration.includes("display_text") && migration.includes("filter_matches_json"));
check("pack installation table is added", migration.includes("content_filter_pack_installs"));
check("existing non-Japanese and non-English translation targets are migrated", migration.includes("target_language NOT IN ('ja', 'en')"));

const packSource = text("src/content-filter/packs.js");
const packCsvJa = text("data/content-filter-packs/ja-core-v1.csv");
const packCsvEn = text("data/content-filter-packs/en-core-v1.csv");
check("Japanese and English built-in packs exist", packSource.includes('"ja-core-v1"') && packSource.includes('"en-core-v1"'));
check("pack CSV files use documented columns", packCsvJa.replace(/^\uFEFF/, "").startsWith("term,language_code") && packCsvEn.replace(/^\uFEFF/, "").startsWith("term,language_code"));
check("built-in packs contain no political category", !packCsvJa.includes(",political,") && !packCsvEn.includes(",political,"));

const repository = text("src/content-filter/repository.js");
const aiRepository = text("src/ai/repository.js");
const processor = text("src/ai/processor.js");
const comments = text("src/comments/repository.js");
const realtime = text("src/realtime/repository.js");
check("packs are copied into editable organization terms", repository.includes("installFilterPack") && (repository.includes("INSERT OR IGNORE INTO content_filter_terms") || repository.includes("ON CONFLICT DO UPDATE SET")));
check("unsupported languages are detected before persistence", repository.includes("detectCommentLanguage") && repository.includes("unsupportedLanguage"));
check("unsupported languages force AI reference routing", aiRepository.includes("unsupportedAiReview") && aiRepository.includes("moderation_enabled || unsupportedAiReview"));
check("pending unsupported comments are not translated", aiRepository.includes('context.moderation_state === "visible"'));
check("translation output is filtered before persistence", processor.includes("evaluateTranslationFilter") && processor.indexOf("evaluateTranslationFilter") < processor.indexOf("completeTranslationJob"));
check("realtime sends filtered translation text only", aiRepository.includes("translation: displayText") && realtime.includes("t.display_text"));
check("teacher comment list uses filtered translation text", comments.includes("t.display_text") && comments.includes("translation_filter_action"));

const filterValidation = text("src/content-filter/validation.js");
const aiValidation = text("src/ai/validation.js");
check("dictionary language options are restricted to Japanese and English", filterValidation.includes('["ja", "日本語"]') && filterValidation.includes('["en", "英語"]') && !filterValidation.includes('["ko"'));
check("translation targets are restricted to Japanese and English", aiValidation.includes('["ja", "en"]'));

const html = text("public/admin/index.html");
const admin = text("public/assets/admin.js");
check("simple UI exposes bilingual pack status", html.includes("filterPackStatus") && html.includes("installJapaneseFilterPackButton") && html.includes("installEnglishFilterPackButton"));
check("recommended preset auto-installs bilingual packs", admin.includes("ensureBilingualFilterPacks") && admin.includes("ja-core-v1") && admin.includes("en-core-v1"));
check("advanced UI exposes translation re-filter and unsupported language mode", html.includes("sessionTranslationFilterEnabled") && html.includes("sessionUnsupportedLanguageMode"));
check("later append-only migrations do not replace Stage 7.7 migration", migrations.includes("0013_bilingual_filter_translation_safety.sql"));

const failed = results.filter((item) => !item.ok);
console.log(`\nStage 7.7 boundary summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
