import { readFile } from 'node:fs/promises';
import * as pdfjsLib from '../public/assets/pdfjs/pdf.min.mjs';

const data = new Uint8Array(await readFile(new URL('../tmp/pdf-link-test.pdf', import.meta.url)));
const document = await pdfjsLib.getDocument({ data, disableWorker: true }).promise;
const page = await document.getPage(1);
const annotations = await page.getAnnotations({ intent: 'display' });
const links = annotations.filter((annotation) => annotation.subtype === 'Link');
if (links.length !== 2) throw new Error(`Expected 2 links, got ${links.length}`);
if (!links.some((link) => link.url === 'https://example.com/')) throw new Error('External URL annotation missing');
if (!links.some((link) => link.dest)) throw new Error('Internal destination annotation missing');
console.log('PDF link annotations verified');
