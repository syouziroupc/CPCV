import { spawnSync } from "node:child_process";

const commands = [
  ["Stage 2 DB schema", ["scripts/test-db-v2-schema.mjs"]],
  ["Stage 3-A auth core", ["scripts/test-auth-v2.mjs"]],
  ["Stage 3-B auth API", ["--no-warnings", "scripts/test-auth-api-v2.mjs"]],
  ["Stage 3-C private API", ["--no-warnings", "scripts/test-private-v2.mjs"]],
  ["Stage 4 comments", ["--no-warnings", "scripts/test-comments-v2.mjs"]],
  ["Stage 5 moderation", ["--no-warnings", "scripts/test-moderation-v2.mjs"]],
  ["Stage 6 realtime", ["--no-warnings", "scripts/test-realtime-v2.mjs"]],
  ["Stage 6.5-A email auth", ["--no-warnings", "scripts/test-email-auth-v2.mjs"]],
  ["Stage 6.5 account lifecycle", ["--no-warnings", "scripts/test-account-lifecycle-v2.mjs"]],
  ["Stage 7 AI", ["--no-warnings", "scripts/test-ai-v2.mjs"]],
  ["Stage 7.6 content filter", ["--no-warnings", "scripts/test-content-filter-v2.mjs"]],
  ["Stage 7.7 bilingual filter", ["--no-warnings", "scripts/test-bilingual-filter-v2.mjs"]],
  ["Stage 7.8 dictionary audit", ["scripts/audit-filter-packs.mjs"]],
  ["Stage 7.8 pack upgrade", ["--no-warnings", "scripts/test-filter-pack-upgrade-v2.mjs"]],
  ["Stage 8 PDF analytics", ["--no-warnings", "scripts/test-pdf-analysis-v2.mjs"]],
  ["Stage 8.2 final hardening", ["--no-warnings", "scripts/test-final-hardening.mjs"]]
];

for (const [name, args] of commands) {
  console.log(`\n===== ${name} =====`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit", timeout: 30 * 60 * 1000 });
  if (result.error) {
    console.error(`${name}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log("\nStage 8 complete functional regression passed.");
process.exit(0);
