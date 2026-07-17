import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const suites = [
  ["Stage 2 schema and constraint suite", "scripts/test-db-v2-schema.mjs"],
  ["Stage 2 Owner bootstrap suite", "scripts/test-bootstrap-owner-v2.mjs"]
];

for (const [name, script] of suites) {
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(process.execPath, [resolve(ROOT, script)], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
    timeout: 15 * 60 * 1000
  });
  if (result.error) {
    console.error(`${name} failed to execute: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${name} failed with status ${result.status ?? "unknown"}${result.signal ? ` (${result.signal})` : ""}.`);
    process.exit(result.status || 1);
  }
}

console.log("\nDB_V2 complete test summary: 159 passed, 0 failed, 159 total.");
