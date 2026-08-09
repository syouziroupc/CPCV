import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const files = [
  ".github/workflows/ci.yml",
  ".github/workflows/deploy-production.yml",
  ".github/workflows/responsive-and-ai-regression.yml"
];
const lines = files.map((file) => {
  const hash = createHash("sha256").update(readFileSync(file)).digest("hex");
  return `${hash}  ${file}`;
});
writeFileSync("SOURCE_SHA256SUMS.override.txt", `${lines.join("\n")}\n`);
console.log(lines.join("\n"));