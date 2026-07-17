import { readFileSync } from "node:fs";

const [filePath, mode] = process.argv.slice(2);
if (!filePath || !mode) {
  console.error("Usage: node scripts/verify-d1-query-result.mjs <json-file> <active-owner|no-rows|quick-check>");
  process.exit(2);
}

let payload;
try {
  payload = JSON.parse(readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
} catch (error) {
  console.error(`Unable to parse Wrangler JSON output: ${error.message}`);
  process.exit(1);
}

const executions = Array.isArray(payload) ? payload : [payload];
if (!executions.length || executions.some((entry) => entry?.success === false)) {
  console.error("D1 query did not complete successfully.");
  process.exit(1);
}
const rows = executions.flatMap((entry) => Array.isArray(entry?.results) ? entry.results : []);

if (mode === "active-owner") {
  const count = Number(rows[0]?.active_owner_count);
  if (!Number.isSafeInteger(count) || count < 1) {
    console.error("DB_V2 has no active Owner in an active organization.");
    process.exit(1);
  }
  console.log(`active Owner check passed (${count})`);
  process.exit(0);
}

if (mode === "no-rows") {
  if (rows.length !== 0) {
    console.error(`D1 integrity query returned ${rows.length} unexpected row(s).`);
    process.exit(1);
  }
  console.log("D1 integrity query returned no rows");
  process.exit(0);
}

if (mode === "quick-check") {
  const value = String(rows[0]?.quick_check ?? rows[0]?.integrity_check ?? "").toLowerCase();
  if (rows.length !== 1 || value !== "ok") {
    console.error("D1 quick_check did not return exactly one ok row.");
    process.exit(1);
  }
  console.log("D1 quick_check passed");
  process.exit(0);
}

console.error(`Unknown verification mode: ${mode}`);
process.exit(2);
