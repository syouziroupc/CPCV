import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const knownProduction = { worker: "class-pdf-comment-viewer-v01", legacyDbId: "f11457fa-27af-468d-94cc-6cdf1ae814e4", queue: "cpcv-ai-jobs" };
const args = process.argv.slice(2);
let mode = "production-gate";
let productionPath;
let stagingPath;
if (args.length === 2 && !args[0].startsWith("--")) [productionPath, stagingPath] = args;
else {
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === "--mode") mode = args[i + 1];
    else if (args[i] === "--production") productionPath = args[i + 1];
    else if (args[i] === "--staging") stagingPath = args[i + 1];
    else die(`Unknown option: ${args[i]}`, 2);
  }
}
if (!["staging-preflight", "production-gate"].includes(mode)) die(`Unsupported mode: ${mode}`, 2);
if (!productionPath || !stagingPath) die("Usage: --mode <staging-preflight|production-gate> --production <toml> --staging <toml>", 2);
const production = readFileSync(resolve(productionPath), "utf8");
const staging = readFileSync(resolve(stagingPath), "utf8");
const failures = [], warnings = [];
const prodName = value(production, "name"), stageName = value(staging, "name");
required("staging Worker name", stageName); different("Worker name", prodName, stageName); different("known production Worker name", knownProduction.worker, stageName);
const stageDb = d1(staging, "DB"), stageV2 = d1(staging, "DB_V2");
for (const [label, db] of [["staging DB", stageDb], ["staging DB_V2", stageV2]]) { required(`${label} database_name`, db.name); uuid(`${label} database_id`, db.id); }
different("known production legacy DB UUID", knownProduction.legacyDbId, stageDb.id);
const stageQueue = queue(staging); required("staging queue producer", stageQueue.producer); if (stageQueue.producer !== stageQueue.consumer) failures.push("Staging queue producer and consumer must match."); different("known production Queue", knownProduction.queue, stageQueue.producer);
const stageRates = limiterIds(staging); stageRates.forEach((id, i) => integer(`staging Rate Limiting namespace ${i + 1}`, id)); if (new Set(stageRates).size !== stageRates.length) failures.push("Staging Rate Limiting namespace IDs must be distinct.");
for (const key of ["AUTH_ORIGIN", "PUBLIC_ORIGIN"]) { const v = value(staging, key); if (!/^https:\/\/class-pdf-comment-viewer-v01-staging\.syouziroupc\.workers\.dev$/.test(v)) failures.push(`staging ${key} must equal the staging Worker URL.`); different(key, value(production, key), v); }
if (value(staging, "APP_ENV") !== "production") failures.push("staging APP_ENV must be production for strict remote behavior.");
if (value(staging, "AUTH_V2_ENABLED") !== "1") failures.push("staging AUTH_V2_ENABLED must be 1.");
if (/TURNSTILE_TEST_BYPASS\s*=/.test(staging)) failures.push("staging TURNSTILE_TEST_BYPASS must not be configured.");
if (/(AUTH_RATE_LIMIT_PEPPER|PUBLIC_RATE_LIMIT_PEPPER|TURNSTILE_SECRET_KEY)\s*=/.test(staging)) failures.push("staging config must not contain plaintext secrets.");
const prodV2 = d1(production, "DB_V2"), prodRates = limiterIds(production);
if (mode === "production-gate") {
  uuid("production DB_V2 database_id", prodV2.id); required("production TURNSTILE_SITE_KEY", value(production, "TURNSTILE_SITE_KEY"));
  prodRates.forEach((id, i) => integer(`production Rate Limiting namespace ${i + 1}`, id));
  different("DB_V2 database_id", prodV2.id, stageV2.id);
  const overlap = prodRates.filter((id) => stageRates.includes(id)); if (overlap.length) failures.push(`Production and staging share Rate Limiting namespace_id: ${[...new Set(overlap)].join(", ")}`);
} else {
  if (!validUuid(prodV2.id)) warnings.push("production DB_V2 UUID is unset; production-gate will reject it.");
  if (prodRates.some((id) => !validInteger(id))) warnings.push("production Rate Limiting IDs are unset; production-gate will reject them.");
  if (!value(production, "TURNSTILE_SITE_KEY")) warnings.push("production Turnstile site key is unset; production-gate will reject it.");
  if (validUuid(prodV2.id)) different("DB_V2 database_id", prodV2.id, stageV2.id);
  if (prodRates.every(validInteger) && prodRates.some((id) => stageRates.includes(id))) failures.push("Production and staging share Rate Limiting namespace_id.");
}
warnings.forEach((m) => console.warn(`[WARN] ${m}`));
if (failures.length) { failures.forEach((m) => console.error(`[FAIL] ${m}`)); process.exit(1); }
console.log(`${mode} resource separation verified: ${resolve(productionPath)} <> ${resolve(stagingPath)}`);
function value(t, k) { return t.match(new RegExp(`^${k}\\s*=\\s*"([^"]*)"\\s*$`, "m"))?.[1] || ""; }
function d1(t, binding) { const b = block(t, "d1_databases", "binding", binding); return { name: value(b, "database_name"), id: value(b, "database_id") }; }
function queue(t) { return { producer: value(block(t, "queues.producers", "binding", "AI_JOBS_QUEUE"), "queue"), consumer: value((t.match(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/) || [])[0] || "", "queue") }; }
function limiterIds(t) { return ["AUTH_LOGIN_IP_LIMITER", "AUTH_LOGIN_ACCOUNT_LIMITER", "PUBLIC_COMMENT_RATE_LIMITER", "AUTH_PUBLIC_EMAIL_LIMITER"].map((n) => value(block(t, "ratelimits", "name", n), "namespace_id")); }
function block(t, section, key, val) { return [...t.matchAll(new RegExp(`\\[\\[${section.replace(/\./g, "\\.")}\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)`, "g"))].find((m) => new RegExp(`^${key}\\s*=\\s*"${val}"\\s*$`, "m").test(m[0]))?.[0] || ""; }
function required(l, v) { if (!v) failures.push(`${l} must be set.`); } function validUuid(v) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v); } function uuid(l, v) { if (!validUuid(v)) failures.push(`${l} must be a real UUID.`); } function validInteger(v) { return /^[1-9][0-9]*$/.test(v); } function integer(l, v) { if (!validInteger(v)) failures.push(`${l} must be a positive integer string.`); } function different(l, a, b) { if (!a || !b) { if (mode === "production-gate") failures.push(`${l} must be present in both configurations.`); } else if (a === b) failures.push(`${l} must differ between production and staging.`); } function die(m, c) { console.error(m); process.exit(c); }
