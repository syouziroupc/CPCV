import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeploymentOptions } from "./deployment-cli.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
let target;
try {
  target = parseDeploymentOptions(process.argv.slice(2), { defaultConfigPath: resolve(ROOT, "wrangler.toml") });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
const config = readFileSync(target.configPath, "utf8");
const failures = [];
if (!/^\[ai\]\s*$[\s\S]*?^binding\s*=\s*"AI"\s*$/m.test(config)) failures.push("AI binding is missing.");

const producer = arrayBlock(config, "queues.producers", "binding", "AI_JOBS_QUEUE");
const producerQueue = producer.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
const consumer = [...config.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)]
  .map((match) => match[0])
  .find((block) => /^queue\s*=\s*"([^"]+)"\s*$/m.test(block)) || "";
const consumerQueue = consumer.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
if (!producerQueue) failures.push("AI queue producer is missing.");
if (!consumerQueue) failures.push("AI queue consumer is missing.");
if (producerQueue && consumerQueue && producerQueue !== consumerQueue) failures.push("AI queue producer and consumer must use the same queue.");

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
console.log(`AI configuration is structurally ready. Verify remote queue ${producerQueue} and apply DB_V2 migration 0010 before cutover.`);

function arrayBlock(text, section, key, value) {
  const pattern = new RegExp(`\\[\\[${escapeRegex(section)}\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)`, "g");
  for (const match of text.matchAll(pattern)) {
    if (new RegExp(`^${escapeRegex(key)}\\s*=\\s*"${escapeRegex(value)}"\\s*$`, "m").test(match[0])) return match[0];
  }
  return "";
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
