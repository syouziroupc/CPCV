import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const config = readFileSync(resolve(ROOT, "wrangler.toml"), "utf8");
const failures = [];
if (!/^\[ai\]\s*$[\s\S]*?^binding\s*=\s*"AI"\s*$/m.test(config)) failures.push("AI binding is missing.");
if (!/\[\[queues\.producers\]\][\s\S]*?binding\s*=\s*"AI_JOBS_QUEUE"[\s\S]*?queue\s*=\s*"cpcv-ai-jobs"/.test(config)) failures.push("AI queue producer is missing.");
if (!/\[\[queues\.consumers\]\][\s\S]*?queue\s*=\s*"cpcv-ai-jobs"/.test(config)) failures.push("AI queue consumer is missing.");
for (const name of ["AI_MODERATION_MODEL", "AI_TRANSLATION_MODEL"]) {
  const value = config.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1] || "";
  if (!/^@cf\/[a-z0-9_-]+\/[A-Za-z0-9._-]+$/.test(value)) failures.push(`${name} is invalid.`);
  if (/llama-3\.1-8b-instruct$/.test(value)) failures.push(`${name} uses a deprecated model.`);
}
const timeout = Number(config.match(/^AI_TIMEOUT_MS\s*=\s*"(\d+)"\s*$/m)?.[1] || 0);
if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) failures.push("AI_TIMEOUT_MS must be 1000-30000.");
if (!readFileSync(resolve(ROOT, "migrations-v2/0010_ai_moderation_translation.sql"), "utf8").includes("CREATE TABLE ai_jobs")) failures.push("Stage 7 migration is missing.");
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exit(1);
}
console.log("AI configuration is structurally ready. Before production create or verify queue cpcv-ai-jobs and apply DB_V2 migration 0010.");
