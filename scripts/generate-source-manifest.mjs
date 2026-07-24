import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = resolve(ROOT, "SOURCE_SHA256SUMS.txt");
const OVERRIDE = resolve(ROOT, "SOURCE_SHA256SUMS.override.txt");
const manifestFiles = new Set(["SOURCE_SHA256SUMS.txt", "SOURCE_SHA256SUMS.override.txt"]);
const untracked = spawnSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: ROOT, encoding: "buffer" });
if (untracked.status !== 0) {
  process.stderr.write(untracked.stderr || Buffer.from("git untracked-file scan failed\n"));
  process.exit(2);
}
const untrackedFiles = untracked.stdout.toString("utf8").split("\0").filter(Boolean);
if (untrackedFiles.length) {
  for (const file of untrackedFiles) console.error(`[FAIL] untracked path must be reviewed and added or removed before manifest generation: ${file}`);
  process.exit(1);
}
const tracked = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
if (tracked.status !== 0) {
  process.stderr.write(tracked.stderr || Buffer.from("git ls-files failed\n"));
  process.exit(2);
}
const files = tracked.stdout.toString("utf8").split("\0").filter(Boolean).filter((file) => !manifestFiles.has(file)).sort();
const blobs = gitBlobs(files.map((file) => `:${file}`));
const lines = files.map((file) => `${createHash("sha256").update(blobs.get(`:${file}`)).digest("hex")}  ${file}`);
writeFileSync(MANIFEST, `${lines.join("\n")}\n`, "utf8");
writeFileSync(OVERRIDE, "", "utf8");
console.log(`source SHA-256 manifest generated: ${files.length} files`);

function gitBlobs(specs) {
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: ROOT,
    input: Buffer.from(`${specs.join("\n")}\n`),
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || Buffer.from("git cat-file batch failed\n"));
    process.exit(2);
  }
  const blobs = new Map();
  let offset = 0;
  for (const spec of specs) {
    const headerEnd = result.stdout.indexOf(10, offset);
    const header = result.stdout.subarray(offset, headerEnd).toString("utf8").split(" ");
    const size = Number(header[2]);
    if (headerEnd < 0 || header[1] !== "blob" || !Number.isSafeInteger(size)) {
      process.stderr.write(`git cat-file returned an invalid blob header for ${spec}\n`);
      process.exit(2);
    }
    offset = headerEnd + 1;
    blobs.set(spec, result.stdout.subarray(offset, offset + size));
    offset += size + 1;
  }
  return blobs;
}
