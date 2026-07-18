import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(ROOT, "SOURCE_SHA256SUMS.txt");
if (!existsSync(manifestPath)) fail("SOURCE_SHA256SUMS.txt is missing.");
const dirtyResult = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
if (dirtyResult.status !== 0) fail("git status failed.");
if (dirtyResult.stdout.trim()) fail("source manifest verification requires a clean Git working tree.");
const trackedResult = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
if (trackedResult.status !== 0) fail("git ls-files failed.");
const tracked = new Set(trackedResult.stdout.toString("utf8").split("\0").filter(Boolean).filter((file) => file !== "SOURCE_SHA256SUMS.txt"));
const blobs = gitBlobs([...tracked].map((file) => `HEAD:${file}`));
const listed = new Set();
const failures = [];
for (const raw of readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
  if (!raw) continue;
  const match = raw.match(/^([0-9a-f]{64})  (.+)$/);
  if (!match) { failures.push(`invalid manifest line: ${raw}`); continue; }
  const [, expected, file] = match;
  if (listed.has(file)) { failures.push(`duplicate manifest path: ${file}`); continue; }
  listed.add(file);
  if (!tracked.has(file)) { failures.push(`manifest path is not tracked: ${file}`); continue; }
  const actual = createHash("sha256").update(blobs.get(`HEAD:${file}`)).digest("hex");
  if (actual !== expected) failures.push(`SHA-256 mismatch: ${file}`);
}
for (const file of tracked) if (!listed.has(file)) failures.push(`tracked path missing from manifest: ${file}`);
if (failures.length) {
  for (const failure of failures) console.error(`[FAIL] ${failure}`);
  process.exit(1);
}
console.log(`source SHA-256 manifest verified: ${listed.size} files`);

function gitBlobs(specs) {
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: ROOT,
    input: Buffer.from(`${specs.join("\n")}\n`),
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) fail("git cat-file batch failed.");
  const blobs = new Map();
  let offset = 0;
  for (const spec of specs) {
    const headerEnd = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(header[2]);
    if (headerEnd < 0 || header[1] !== "blob" || !Number.isSafeInteger(size)) fail(`git cat-file returned an invalid blob header for ${spec}.`);
    offset = headerEnd + 1;
    blobs.set(spec, result.stdout.subarray(offset, offset + size));
    offset += size + 1;
  }
  return blobs;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}
