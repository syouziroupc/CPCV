import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const viewer = await readFile(join(root, 'public/assets/viewer.js'), 'utf8');

const required = [
  'getPdfLinkHitAreas',
  'flattenQuadPoints',
  'mergeSameLineLinkAreas',
  'areLinkAreasOnSameLine',
  'linkGroups',
  'goToPdfDestination'
];

for (const token of required) {
  if (!viewer.includes(token)) throw new Error(`Missing PDF link feature: ${token}`);
}

if (viewer.includes('recentComments')) {
  throw new Error('Recent comment replay must remain disabled');
}

if (viewer.includes('annotation.unsafeUrl')) {
  throw new Error('PDF.js unsafeUrl must never become a clickable external link');
}

if (!viewer.includes("const externalUrl = annotation.url || '';")) {
  throw new Error('External PDF links must use only PDF.js validated annotation.url');
}

console.log('PDF link and reconnect logic verified');
