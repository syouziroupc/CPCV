import { readFileSync } from "node:fs";

const text = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");
const match = text.match(/^PUBLIC_ORIGIN\s*=\s*"([^"]+)"\s*$/m);
if (!match || !/^https:\/\//.test(match[1])) {
  console.error("A final HTTPS PUBLIC_ORIGIN is required.");
  process.exit(1);
}
process.stdout.write(match[1]);
