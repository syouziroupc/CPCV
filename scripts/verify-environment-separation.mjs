import { readFileSync } from "node:fs";
import { resolve } from "node:path";

if (process.argv.length !== 4) {
  console.error("Usage: node scripts/verify-environment-separation.mjs <production-config> <staging-config>");
  process.exit(2);
}

const productionPath = resolve(process.argv[2]);
const stagingPath = resolve(process.argv[3]);
const production = readFileSync(productionPath, "utf8");
const staging = readFileSync(stagingPath, "utf8");
const failures = [];

compareDifferent("Worker name", topValue(production, "name"), topValue(staging, "name"));
compareDifferent("AUTH_ORIGIN", variable(production, "AUTH_ORIGIN"), variable(staging, "AUTH_ORIGIN"));
compareDifferent("PUBLIC_ORIGIN", variable(production, "PUBLIC_ORIGIN"), variable(staging, "PUBLIC_ORIGIN"));
compareDifferent("TURNSTILE_SITE_KEY", variable(production, "TURNSTILE_SITE_KEY"), variable(staging, "TURNSTILE_SITE_KEY"));

const d1Bindings = ["DB", "DB_V2"];
const allDatabaseIds = [];
for (const binding of d1Bindings) {
  const prod = d1(production, binding);
  const stage = d1(staging, binding);
  requireUuid(`production ${binding} database_id`, prod.databaseId);
  requireUuid(`staging ${binding} database_id`, stage.databaseId);
  compareDifferent(`${binding} database_name`, prod.databaseName, stage.databaseName);
  compareDifferent(`${binding} database_id`, prod.databaseId, stage.databaseId);
  allDatabaseIds.push(prod.databaseId, stage.databaseId);
}
if (allDatabaseIds.filter(Boolean).length !== new Set(allDatabaseIds.filter(Boolean)).size) {
  failures.push("All production and staging D1 database_id values must be distinct.");
}

const productionQueue = queue(production);
const stagingQueue = queue(staging);
if (!productionQueue.producer || productionQueue.producer !== productionQueue.consumer) {
  failures.push("Production queue producer and consumer must use the same non-empty queue name.");
}
if (!stagingQueue.producer || stagingQueue.producer !== stagingQueue.consumer) {
  failures.push("Staging queue producer and consumer must use the same non-empty queue name.");
}
compareDifferent("Queue", productionQueue.producer, stagingQueue.producer);

const limiterNames = [
  "AUTH_LOGIN_IP_LIMITER",
  "AUTH_LOGIN_ACCOUNT_LIMITER",
  "PUBLIC_COMMENT_RATE_LIMITER",
  "AUTH_PUBLIC_EMAIL_LIMITER"
];
const productionNamespaces = limiterNames.map((name) => rateNamespace(production, name));
const stagingNamespaces = limiterNames.map((name) => rateNamespace(staging, name));
for (let index = 0; index < limiterNames.length; index += 1) {
  requirePositiveInteger(`production ${limiterNames[index]} namespace_id`, productionNamespaces[index]);
  requirePositiveInteger(`staging ${limiterNames[index]} namespace_id`, stagingNamespaces[index]);
}
if (productionNamespaces.filter(Boolean).length !== new Set(productionNamespaces.filter(Boolean)).size) {
  failures.push("Production Rate Limiting namespace_id values must be distinct.");
}
if (stagingNamespaces.filter(Boolean).length !== new Set(stagingNamespaces.filter(Boolean)).size) {
  failures.push("Staging Rate Limiting namespace_id values must be distinct.");
}
const sharedNamespaces = productionNamespaces.filter((value) => value && stagingNamespaces.includes(value));
if (sharedNamespaces.length) failures.push(`Production and staging share Rate Limiting namespace_id: ${[...new Set(sharedNamespaces)].join(", ")}`);

for (const [label, value] of [
  ["production AUTH_ORIGIN", variable(production, "AUTH_ORIGIN")],
  ["production PUBLIC_ORIGIN", variable(production, "PUBLIC_ORIGIN")],
  ["staging AUTH_ORIGIN", variable(staging, "AUTH_ORIGIN")],
  ["staging PUBLIC_ORIGIN", variable(staging, "PUBLIC_ORIGIN")]
]) {
  if (!/^https:\/\//.test(value)) failures.push(`${label} must be HTTPS.`);
}

if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exit(1);
}
console.log(`production and staging resource separation verified: ${productionPath} <> ${stagingPath}`);

function topValue(text, key) {
  return text.match(new RegExp(`^${escapeRegex(key)}\\s*=\\s*"([^"]+)"\\s*$`, "m"))?.[1] || "";
}
function variable(text, key) { return topValue(text, key); }
function d1(text, binding) {
  const block = arrayBlock(text, "d1_databases", "binding", binding);
  return {
    databaseName: block.match(/^database_name\s*=\s*"([^"]+)"\s*$/m)?.[1] || "",
    databaseId: block.match(/^database_id\s*=\s*"([^"]+)"\s*$/m)?.[1] || ""
  };
}
function queue(text) {
  const producerBlock = arrayBlock(text, "queues.producers", "binding", "AI_JOBS_QUEUE");
  const consumerBlock = [...text.matchAll(/\[\[queues\.consumers\]\]([\s\S]*?)(?=\n\[\[|\n\[[^\[]|$)/g)][0]?.[0] || "";
  return {
    producer: producerBlock.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || "",
    consumer: consumerBlock.match(/^queue\s*=\s*"([^"]+)"\s*$/m)?.[1] || ""
  };
}
function rateNamespace(text, name) {
  const block = arrayBlock(text, "ratelimits", "name", name);
  return block.match(/^namespace_id\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
}
function arrayBlock(text, section, key, value) {
  const pattern = new RegExp(`\\[\\[${escapeRegex(section)}\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)`, "g");
  for (const match of text.matchAll(pattern)) {
    if (new RegExp(`^${escapeRegex(key)}\\s*=\\s*"${escapeRegex(value)}"\\s*$`, "m").test(match[0])) return match[0];
  }
  return "";
}
function compareDifferent(label, left, right) {
  if (!left || !right) failures.push(`${label} must be present in both configurations.`);
  else if (left === right) failures.push(`${label} must differ between production and staging.`);
}
function requireUuid(label, value) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) failures.push(`${label} must be a real UUID.`);
}
function requirePositiveInteger(label, value) {
  if (!/^[1-9][0-9]*$/.test(value)) failures.push(`${label} must be a positive integer string.`);
}
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
