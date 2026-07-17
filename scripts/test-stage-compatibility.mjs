import { spawnSync } from "node:child_process";

const stages = ["stage02", "stage03a", "stage03b", "stage03c", "stage04", "stage05", "stage06"];
let passed = 0;
for (const stage of stages) {
  const result = spawnSync(process.execPath, [`scripts/verify-${stage}-boundaries.mjs`], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  const ok = result.status === 0;
  console.log(`[${ok ? "PASS" : "FAIL"}] ${stage} compatibility command`);
  if (ok) passed += 1;
}
const failed = stages.length - passed;
console.log(`\nStage compatibility command summary: ${passed} passed, ${failed} failed, ${stages.length} total.`);
if (failed) process.exitCode = 1;
