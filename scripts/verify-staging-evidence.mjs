import { readFileSync } from "node:fs";
import { resolve } from "node:path";

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.error("Usage: node scripts/verify-staging-evidence.mjs <record-file> --commit <40hex> --deployment <id> --config-sha256 <64hex>");
    process.exit(args.includes("--help") ? 0 : 2);
  }

  const recordPath = resolve(args.shift());
  const options = parseOptions(args);
  const text = readFileSync(recordPath, "utf8");
  const values = parseRecord(text);
  const failures = [];

  expectExact("record_format", "CPCV_STAGING_ACCEPTANCE_V1");
  expectExact("result", "PASSED");
  expectExact("release_commit", options.commit.toLowerCase(), true);
  expectExact("staging_deployment_id", options.deployment);
  expectExact("staging_config_sha256", options.configSha256.toLowerCase(), true);
  expectExact("acceptance_items_failed", "0");
  expectExact("production_resources_used", "NO");
  expectExact("test_data_cleanup", "COMPLETED");
  expectExact("pdf_data_egress", "NONE");

  const total = Number(values.get("acceptance_items_total"));
  if (!Number.isSafeInteger(total) || total < 1) failures.push("acceptance_items_total must be a positive integer.");
  const completedAt = values.get("completed_at_utc") || "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(completedAt) || Number.isNaN(Date.parse(completedAt))) {
    failures.push("completed_at_utc must be a valid UTC ISO-8601 timestamp ending in Z.");
  }
  const executor = values.get("executed_by") || "";
  if (!executor.trim()) failures.push("executed_by must be present.");

  if (failures.length) {
    for (const failure of failures) console.error(`[FAIL] ${failure}`);
    process.exit(1);
  }
  console.log(`staging acceptance evidence verified: ${recordPath}`);

  function expectExact(key, expected, caseInsensitive = false) {
    const actual = values.get(key);
    if (actual === undefined) {
      failures.push(`${key} is missing.`);
      return;
    }
    const matches = caseInsensitive ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
    if (!matches) failures.push(`${key} must equal ${expected}.`);
  }
}

function parseOptions(argv) {
  const parsed = { commit: "", deployment: "", configSha256: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[++index] || "";
    if (name === "--commit") parsed.commit = value;
    else if (name === "--deployment") parsed.deployment = value;
    else if (name === "--config-sha256") parsed.configSha256 = value;
    else throw new Error(`Unknown staging evidence option: ${name}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(parsed.commit)) throw new Error("--commit must be an exact 40-character Git SHA.");
  if (!parsed.deployment || /[\r\n\0]/.test(parsed.deployment)) throw new Error("--deployment must be a non-empty single-line value.");
  if (!/^[0-9a-f]{64}$/i.test(parsed.configSha256)) throw new Error("--config-sha256 must be a 64-character SHA-256 value.");
  return parsed;
}

function parseRecord(content) {
  const map = new Map();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid staging record line: ${raw}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[a-z0-9_]+$/.test(key)) throw new Error(`Invalid staging record key: ${key}`);
    if (map.has(key)) throw new Error(`Duplicate staging record key: ${key}`);
    map.set(key, value);
  }
  return map;
}
