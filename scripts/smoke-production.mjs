import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const origin = config.match(/^PUBLIC_ORIGIN\s*=\s*"([^"]+)"\s*$/m)?.[1] || "";
if (!/^https:\/\//.test(origin)) {
  console.error("A final HTTPS PUBLIC_ORIGIN is required for smoke testing.");
  process.exit(1);
}

await retry(async () => {
  const response = await fetch(`${origin}/`, { redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`home returned ${response.status}`);
  requireHeader(response, "x-content-type-options", "nosniff");
  requireHeader(response, "x-frame-options", "DENY");
});

await retry(async () => {
  const response = await fetch(`${origin}/api/auth/session`, { redirect: "error", cache: "no-store" });
  const body = await response.json().catch(() => null);
  if (response.status !== 401 || body?.error !== "AUTH_REQUIRED") {
    throw new Error(`session probe returned ${response.status} ${JSON.stringify(body)}`);
  }
  requireHeader(response, "cache-control", "no-store");
  requireHeader(response, "strict-transport-security", "max-age=31536000");
});
console.log(`production smoke checks passed: ${origin}`);

async function retry(fn) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { await fn(); return; }
    catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
  throw lastError;
}
function requireHeader(response, name, expected) {
  const value = response.headers.get(name) || "";
  if (value !== expected) throw new Error(`${name} header mismatch: ${value}`);
}
