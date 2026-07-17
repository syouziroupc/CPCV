import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MANIFEST = resolve(ROOT, "SOURCE_SHA256SUMS.txt");
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
const files = tracked.stdout.toString("utf8").split("\0").filter(Boolean).filter((file) => file !== "SOURCE_SHA256SUMS.txt").sort();
const lines = files.map((file) => `${createHash("sha256").update(readFileSync(resolve(ROOT, file))).digest("hex")}  ${file}`);
writeFileSync(MANIFEST, `${lines.join("\n")}\n`, "utf8");
console.log(`source SHA-256 manifest generated: ${files.length} files`);
