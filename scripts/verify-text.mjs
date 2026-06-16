// Ad-hoc verification: load a real font, run text through the Cornu fitter
// via the built dist, and emit an SVG we can eyeball in a browser.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseFont } from '../dist/text.js';

const FONT = process.argv[2];
const TEXT = process.argv[3] ?? 'Cornu';
const OUT = process.argv[4] ?? '/tmp/cornu-text.svg';

const data = readFileSync(FONT);
const font = parseFont(new Uint8Array(data));

// Compare a legible (high detail) and a sketchy (low detail + jitter) render.
const a = font.render(TEXT, { fontSize: 200, detail: 6, tweaks: 20 });
const b = font.render(TEXT, { fontSize: 200, detail: 2, jitter: 6, tweaks: 20 });

const pad = 40;
const minX = Math.min(a.bounds.minX, b.bounds.minX) - pad;
const minY = Math.min(a.bounds.minY, b.bounds.minY) - pad;
const w = Math.max(a.bounds.maxX, b.bounds.maxX) - minX + pad;
const h = a.bounds.maxY - a.bounds.minY + (b.bounds.maxY - b.bounds.minY) + pad * 3;

const offsetB = a.bounds.maxY - a.bounds.minY + pad;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${w} ${h}" width="${w}" height="${h}">
  <rect x="${minX}" y="${minY}" width="${w}" height="${h}" fill="white"/>
  <path d="${a.path}" fill="none" stroke="#111" stroke-width="3"/>
  <g transform="translate(0 ${offsetB})">
    <path d="${b.path}" fill="none" stroke="#e0245e" stroke-width="3"/>
  </g>
</svg>`;

writeFileSync(OUT, svg);
console.log(`Wrote ${OUT}`);
console.log(`Top (detail 6): ${a.segments.length} segments`);
console.log(`Bottom (detail 2 + jitter): ${b.segments.length} segments`);
