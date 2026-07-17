import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BUILT_IN_FILTER_PACKS } from "../src/content-filter/packs.js";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const results = [];
const text = (path) => readFileSync(resolve(ROOT, path), "utf8");
function check(name, condition, detail = "") {
  const ok = Boolean(condition); results.push({ name, ok });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}`);
  if (!ok && detail) console.error(detail);
}
const migrations = readdirSync(resolve(ROOT, "migrations-v2")).filter((name) => /^\d+_.*\.sql$/.test(name)).sort();
check("Stage 7.8 migration remains in the ordered migration chain", migrations.includes("0014_filter_pack_expansion.sql") && migrations.indexOf("0014_filter_pack_expansion.sql") < migrations.length - 1, migrations);
const migration = text("migrations-v2/0014_filter_pack_expansion.sql");
check("pack source keys have a deterministic partial unique index", migration.includes("source_pack_term_key") && migration.includes("CREATE UNIQUE INDEX"));
check("four Japanese and English pack CSVs are present", ["ja-core-v1.csv", "ja-context-v1.csv", "en-core-v1.csv", "en-context-v1.csv"].every((name) => text(`data/content-filter-packs/${name}`).replace(/^\uFEFF/, "").startsWith("term,language_code")));
check("core packs are version 2 and context packs are separate", BUILT_IN_FILTER_PACKS.length === 4 && BUILT_IN_FILTER_PACKS.filter((pack) => pack.id.includes("core")).every((pack) => pack.version === 2) && BUILT_IN_FILTER_PACKS.filter((pack) => pack.id.includes("context")).every((pack) => pack.version === 1));
check("built-in packs contain no political category", BUILT_IN_FILTER_PACKS.every((pack) => pack.terms.every((term) => term.category !== "political")));
const repository = text("src/content-filter/repository.js");
check("pack upgrades update untouched source-managed rows", repository.includes("ON CONFLICT DO UPDATE SET") && repository.includes("source_pack_term_key") && repository.includes("deleted_at IS NULL"));
check("pack upgrades do not resurrect user-deleted rows", repository.includes("if (existing?.deleted_at) continue"));
const html = text("public/admin/index.html");
const admin = text("public/assets/admin.js");
check("simple recommended mode installs core packs", admin.includes("ensureBilingualFilterPacks") && admin.includes("['ja-core-v1', 'en-core-v1']"));
check("strict mode installs context packs", admin.includes("ja-context-v1") && admin.includes("en-context-v1"));
check("individual pack controls are hidden in advanced details", html.includes("installJapaneseContextFilterPackButton") && html.includes("installEnglishContextFilterPackButton") && html.includes("<details"));
const pkg = JSON.parse(text("package.json"));
check("package version is Stage 7.8 or later", /^0\.(?:7\.(?:8|9)|8\.)/.test(pkg.version), pkg.version);
check("Stage 7.8 commands are registered", Boolean(pkg.scripts["audit:filter-packs"] && pkg.scripts["db:v2:test:stage07-8"] && pkg.scripts["check:stage07-8"]));
const failed = results.filter((item) => !item.ok);
console.log(`\nStage 7.8 boundary summary: ${results.length - failed.length} passed, ${failed.length} failed, ${results.length} total.`);
if (failed.length) process.exitCode = 1;
