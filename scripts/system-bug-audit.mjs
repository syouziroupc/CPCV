import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const roots = ['src', 'public/assets', 'scripts'];
const excluded = new Set([
  'public/assets/pdfjs/pdf.min.mjs',
  'public/assets/pdfjs/pdf.worker.min.mjs',
  'scripts/system-bug-audit.mjs'
]);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) out.push(...walk(path));
    else if (/\.(?:js|mjs)$/.test(name)) out.push(path);
  }
  return out;
}

const files = roots.flatMap((root) => walk(join(ROOT, root)))
  .map((path) => relative(ROOT, path).replaceAll('\\', '/'))
  .filter((path) => !excluded.has(path));

const rules = [
  ['RAW_FETCH', /\bfetch\s*\(/],
  ['VOID_ASYNC', /\bvoid\s+[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\(/],
  ['EMPTY_CATCH', /catch\s*(?:\([^)]*\))?\s*\{\s*\}/],
  ['SET_INTERVAL', /\bsetInterval\s*\(/],
  ['SET_TIMEOUT', /\b(?:window\.)?setTimeout\s*\(/],
  ['DO_GET', /\b(?:COMMENT_ROOM|namespace)\.get\s*\(/],
  ['SET_ALARM', /\.setAlarm\s*\(/],
  ['GET_ALARM', /\.getAlarm\s*\(/],
  ['DIRECT_JSON', /await\s+[A-Za-z_$][\w$]*\.json\s*\(\s*\)/],
  ['CATCH_RETURN_FALSE', /catch\s*(?:\([^)]*\))?\s*\{[^}]*return\s+false\s*;/],
  ['PROMISE_ALL', /\bPromise\.all\s*\(/]
];

const counts = new Map();
for (const [name] of rules) counts.set(name, 0);
for (const file of files) {
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const [name, pattern] of rules) {
      if (!pattern.test(line)) continue;
      counts.set(name, counts.get(name) + 1);
      console.log(`${name}\t${file}:${index + 1}\t${line.trim().slice(0, 220)}`);
    }
  }
}
console.log('\nSUMMARY');
for (const [name, count] of counts) console.log(`${name}\t${count}`);
console.log(`FILES\t${files.length}`);
