import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_OUTPUT = resolve(ROOT, ".cpcv-staging.wrangler.toml");

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes("--help")) {
    console.error("Usage: node scripts/materialize-staging-config.mjs <external-config> [--expected-sha256 <64hex>] [--output <runtime-config>]");
    process.exit(args.includes("--help") ? 0 : 2);
  }

  const source = resolve(args.shift());
  let output = DEFAULT_OUTPUT;
  let expected = "";
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    const value = args[++index] || "";
    if (name === "--expected-sha256") expected = value.toLowerCase();
    else if (name === "--output") output = resolve(value);
    else throw new Error(`Unknown option: ${name}`);
  }

  if (!existsSync(source)) throw new Error("External staging config does not exist.");
  if (isInside(ROOT, source)) throw new Error("Canonical staging config must remain outside the source working tree.");
  if (!isInside(ROOT, output)) throw new Error("Runtime staging config must be created inside the source working tree.");
  if (basename(output) !== ".cpcv-staging.wrangler.toml") {
    throw new Error("Runtime staging config filename must be .cpcv-staging.wrangler.toml.");
  }
  if (expected && !/^[0-9a-f]{64}$/.test(expected)) throw new Error("--expected-sha256 must be a 64-character SHA-256 value.");

  const bytes = readFileSync(source);
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (expected && hash !== expected) throw new Error("External staging config SHA-256 does not match the expected value.");

  const temporary = resolve(dirname(output), `${basename(output)}.tmp-${process.pid}`);
  try {
    writeFileSync(temporary, bytes, { mode: 0o600 });
    const copiedHash = createHash("sha256").update(readFileSync(temporary)).digest("hex");
    if (copiedHash !== hash) throw new Error("Runtime staging config copy failed SHA-256 verification.");
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }

  console.log(`runtime_config=${output}`);
  console.log(`sha256=${hash}`);
}

function isInside(parent, child) {
  const value = relative(parent, child);
  return value !== "" && value !== ".." && !value.startsWith(`..${sep}`) && !value.startsWith("../") && !value.startsWith("..\\");
}
