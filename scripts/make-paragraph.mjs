// Render a contained multi-line paragraph as Cornu splines -> PNG, for the
// README. Mirrors the hero GIF's framed, fully-contained look.
//
// Usage: node scripts/make-paragraph.mjs [fontPath] [outPng]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { parseFont } from '../dist/text.js';

const FONT = process.argv[2] || 'docs/font.ttf';
const OUT = process.argv[3] || 'assets/cornu-paragraph.png';
const TEXT =
	'The quick brown fox jumps over the lazy dog. Cornu splines flow smoothly through every control point.';

const STYLE = {
	fontSize: 72,
	maxWidth: 760,
	lineHeight: 1.4,
	detail: 4,
	stroke: '#111111',
	strokeWidth: 2.5,
	background: '#ffffff',
	frame: '#e6e6e6',
	pad: 70,
	inset: 26,
	rasterWidth: 1000,
};

if (!existsSync(FONT)) {
	console.error(`Font not found: ${FONT}`);
	process.exit(1);
}

const font = parseFont(new Uint8Array(readFileSync(FONT)));
const { path, bounds } = font.renderParagraph(TEXT, {
	fontSize: STYLE.fontSize,
	maxWidth: STYLE.maxWidth,
	lineHeight: STYLE.lineHeight,
	detail: STYLE.detail,
	align: 'left',
});

const { pad, inset } = STYLE;
const x0 = bounds.minX - pad;
const y0 = bounds.minY - pad;
const W = Math.round(bounds.width + pad * 2);
const H = Math.round(bounds.height + pad * 2);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}">
  <rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${STYLE.background}"/>
  <rect x="${x0 + inset}" y="${y0 + inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="24"
        fill="none" stroke="${STYLE.frame}" stroke-width="2"/>
  <path d="${path}" fill="none" stroke="${STYLE.stroke}" stroke-width="${STYLE.strokeWidth}" stroke-linecap="round"/>
</svg>`;

const png = new Resvg(svg, { fitTo: { mode: 'width', value: STYLE.rasterWidth } })
	.render()
	.asPng();
writeFileSync(OUT, png);
console.log(`Wrote ${OUT} (${W}x${H} viewBox)`);
