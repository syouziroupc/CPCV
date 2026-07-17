import { readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;
const roots = ["src", "scripts", "public/assets"];
const javascriptFiles = roots.flatMap((directory) => collectJavaScript(join(root, directory)));

for (const absolute of javascriptFiles) {
  const result = spawnSync(node, ["--check", absolute], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    throw new Error(`JavaScript syntax check failed: ${relative(root, absolute)}`);
  }
}

const projectCheck = spawnSync(node, [join(root, "scripts/verify-project.mjs")], {
  encoding: "utf8",
  stdio: "inherit"
});
if (projectCheck.status !== 0) process.exit(projectCheck.status || 1);

const worker = readFileSync(join(root, "src/index.js"), "utf8");
const viewer = readFileSync(join(root, "public/assets/viewer.js"), "utf8");
const viewerHtml = readFileSync(join(root, "public/_viewer_spa.html"), "utf8");
const assertions = [
  [!worker.includes("recentComments"), "Worker must not retain or replay recent comments"],
  [!viewer.includes("recentComments"), "Viewer must not enqueue replayed recent comments"],
  [viewer.includes("getPdfLinkHitAreas"), "PDF link hit-area support is missing"],
  [viewer.includes("linkGroups"), "Same-target PDF link grouping is missing"],
  [viewer.includes("pdfCanvas.addEventListener('click'"), "PDF click-to-next-page support is missing"],
  [viewerHtml.includes("pdfAnnotationLayer"), "PDF annotation layer markup is missing"],
  [/viewer\.js\?v=\d+\.\d+\.\d+/.test(viewerHtml), "Viewer asset has no cache version"],
  [worker.includes("runScheduledMaintenance"), "Scheduled retention handler is missing"],
  [worker.includes("applyHtmlSecurityHeaders"), "HTML security headers are not applied"]
];
for (const [condition, message] of assertions) if (!condition) throw new Error(message);
console.log(`predeploy check passed (${javascriptFiles.length} JavaScript modules)`);

function collectJavaScript(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...collectJavaScript(path));
    else if (/\.(?:js|mjs)$/.test(entry.name)) output.push(path);
  }
  return output;
}
