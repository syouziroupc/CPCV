import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDeploymentOptions, withWranglerConfig } from "./deployment-cli.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
let target;
try {
  target = parseDeploymentOptions(process.argv.slice(2), { defaultConfigPath: resolve(ROOT, "wrangler.toml") });
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const specifications = [
  ["AUTH_RATE_LIMIT_PEPPER", 32],
  ["PUBLIC_RATE_LIMIT_PEPPER", 32],
  ["TURNSTILE_SECRET_KEY", 20]
];

for (const [name, minimumLength] of specifications) {
  const secret = String(process.env[name] || "");
  if (secret.length < minimumLength || secret.length > 4096 || /[\r\n\0]/.test(secret)) {
    console.error(`${name} must be a single-line secret between ${minimumLength} and 4096 characters.`);
    process.exit(1);
  }
  const args = withWranglerConfig(["wrangler", "secret", "put", name], target.configPath);
  const result = spawnSync(process.platform === "win32" ? "npx.cmd" : "npx", args,
    { cwd: ROOT, env: process.env, input: secret, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || `${name} configuration failed.\n`);
    process.exit(result.status || 1);
  }
  process.stdout.write(result.stdout || `${name} configured.\n`);
}
