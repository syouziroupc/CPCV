import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const configPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : resolve(ROOT, "wrangler.toml");
const text = readFileSync(configPath, "utf8");
const failures = [];

const dbBlock = findArrayBlock("d1_databases", "binding", "DB_V2");
if (!dbBlock) failures.push("DB_V2 binding is missing.");
else if (!/^database_id\s*=\s*"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}"\s*$/im.test(dbBlock)) {
  failures.push("DB_V2 requires its real remote UUID before deployment.");
}

const ipLimiterNamespace = verifyRateLimiter("AUTH_LOGIN_IP_LIMITER", 20, 60);
const accountLimiterNamespace = verifyRateLimiter("AUTH_LOGIN_ACCOUNT_LIMITER", 10, 60);
const publicLimiterNamespace = verifyRateLimiter("PUBLIC_COMMENT_RATE_LIMITER", 30, 60);
const publicEmailLimiterNamespace = verifyRateLimiter("AUTH_PUBLIC_EMAIL_LIMITER", 30, 60);
const limiterNamespaces = [ipLimiterNamespace, accountLimiterNamespace, publicLimiterNamespace, publicEmailLimiterNamespace].filter(Boolean);
if (new Set(limiterNamespaces).size !== limiterNamespaces.length) {
  failures.push("All Rate Limiting bindings must use different namespace_id values.");
}

const productionValues = {};
for (const name of ["AUTH_EMAIL_FROM", "AUTH_EMAIL_REPLY_TO", "TURNSTILE_SITE_KEY"]) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  productionValues[name] = match?.[1] || "";
  if (!match || /REPLACE_|example\.(?:com|test)|localhost/i.test(match[1])) {
    failures.push(`${name} must contain the final production value.`);
  }
}

const emailBinding = findArrayBlock("send_email", "name", "EMAIL");
if (!emailBinding) failures.push("EMAIL send_email binding is missing.");
else {
  const senderList = emailBinding.match(/^allowed_sender_addresses\s*=\s*\[([^\]]+)\]\s*$/m)?.[1] || "";
  const senders = [...senderList.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  if (!productionValues.AUTH_EMAIL_FROM || !senders.includes(productionValues.AUTH_EMAIL_FROM)) {
    failures.push("EMAIL binding must restrict allowed_sender_addresses to AUTH_EMAIL_FROM.");
  }
}

const emailRequired = text.match(/^EMAIL_AUTH_REQUIRED\s*=\s*"([01])"\s*$/m)?.[1];
if (!emailRequired) failures.push("EMAIL_AUTH_REQUIRED must be 0 or 1.");

if (!/^APP_ENV\s*=\s*"production"\s*$/m.test(text)) failures.push("APP_ENV must be production.");
if (!/^AUTH_V2_ENABLED\s*=\s*"1"\s*$/m.test(text)) failures.push("AUTH_V2_ENABLED must be 1.");
for (const name of ["AUTH_ORIGIN", "PUBLIC_ORIGIN"]) {
  const match = text.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"\\s*$`, "m"));
  if (!match || !/^https:\/\//.test(match[1]) || /REPLACE_|localhost/i.test(match[1])) {
    failures.push(`${name} must be the final HTTPS production origin.`);
  }
}

const cronText = text.match(/^crons\s*=\s*\[([^\]]*)\]\s*$/m)?.[1] || "";
const crons = [...cronText.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
if (!crons.includes("*/5 * * * *")) failures.push("The five-minute AI recovery Cron is required.");
if (!crons.includes("17 3 * * *")) failures.push("The daily retention Cron is required.");

if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exit(1);
}
console.log("production deployment configuration verified");

function findArrayBlock(section, key, value) {
  const pattern = new RegExp(`\\[\\[${section}\\]\\]([\\s\\S]*?)(?=\\n\\[\\[|\\n\\[[^\\[]|$)`, "g");
  for (const match of text.matchAll(pattern)) {
    if (new RegExp(`^${key}\\s*=\\s*"${escapeRegex(value)}"\\s*$`, "m").test(match[0])) return match[0];
  }
  return "";
}

function verifyRateLimiter(name, limit, period) {
  const blocks = text.split(/(?=^\[\[ratelimits\]\]\s*$)/m).filter((block) => /^\[\[ratelimits\]\]\s*$/m.test(block));
  const block = blocks.find((candidate) => new RegExp(`^name\\s*=\\s*"${escapeRegex(name)}"\\s*$`, "m").test(candidate));
  if (!block) {
    failures.push(`${name} binding is missing.`);
    return "";
  }
  const namespaceId = block.match(/^namespace_id\s*=\s*"([1-9][0-9]*)"\s*$/m)?.[1] || "";
  if (!namespaceId) failures.push(`${name} namespace_id must be a real positive integer string.`);
  const inlineSimple = block.match(/^simple\s*=\s*\{([^}]+)\}\s*$/m)?.[1] || "";
  const simpleText = inlineSimple || block;
  if (!new RegExp(`(?:^|[,\\s])limit\\s*=\\s*${limit}(?:[,\\s]|$)`, "m").test(simpleText)
      || !new RegExp(`(?:^|[,\\s])period\\s*=\\s*${period}(?:[,\\s]|$)`, "m").test(simpleText)) {
    failures.push(`${name} must use limit=${limit} and period=${period}.`);
  }
  return namespaceId;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
