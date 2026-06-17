// Build the remaining README visuals (all contained in a rounded frame):
//   assets/cornu-points.png  — control points -> smooth curve (core concept)
//   assets/cornu-modes.png   — outline vs single-stroke text
//   assets/cornu-wobble.gif  — animated wobble loop
//
// Usage: node scripts/make-visuals.mjs [fontPath]
// Requires: @resvg/resvg-js (devDep) and ffmpeg (for the gif).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { cornuToSVGPath, cornuSegments } from '../dist/index.js';
import { parseFont, segmentBounds } from '../dist/text.js';

const DEFAULT_FONTS = [
	'/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf',
	'docs/font.ttf',
];
const FONT = process.argv[2] || DEFAULT_FONTS.find((f) => existsSync(f));

const INK = '#111111';
const DOT = '#e0245e';
const FRAME = '#e6e6e6';
const BG = '#ffffff';
const RW = 1000;

// --- shared helpers -----------------------------------------------------
const f = (n) => {
	const r = Math.round(n * 1e4) / 1e4;
	return Object.is(r, -0) ? '0' : String(r);
};
const toPath = (segs) => {
	let d = '';
	for (const s of segs) {
		if (s.type === 'moveto') d += `M ${f(s.x)} ${f(s.y)} `;
		else if (s.type === 'lineto') d += `L ${f(s.x)} ${f(s.y)} `;
		else d += `C ${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)} `;
	}
	return d.trim();
};
const translate = (segs, dx, dy) =>
	segs.map((s) =>
		s.type === 'curveto'
			? { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy, x: s.x + dx, y: s.y + dy }
			: { ...s, x: s.x + dx, y: s.y + dy },
	);
// Wrap inner SVG markup in a framed, white, fully-contained canvas.
const frame = (inner, x0, y0, W, H, inset = 28, rx = 28) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}">
  <rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${BG}"/>
  <rect x="${x0 + inset}" y="${y0 + inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="${rx}"
        fill="none" stroke="${FRAME}" stroke-width="2"/>
  ${inner}
</svg>`;
const renderPng = (svg, out) => {
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: RW } }).render().asPng();
	writeFileSync(out, png);
};

// --- 1. points -> curve -------------------------------------------------
function makePoints() {
	const PTS = [
		[120, 360],
		[300, 150],
		[480, 380],
		[660, 150],
		[850, 340],
	];
	const d = cornuToSVGPath(PTS);
	const segs = cornuSegments(PTS);
	const b = segmentBounds(segs);
	const pad = 70;
	const x0 = Math.min(b.minX, ...PTS.map((p) => p[0])) - pad;
	const y0 = Math.min(b.minY, ...PTS.map((p) => p[1])) - pad;
	const W = Math.round(Math.max(b.maxX, ...PTS.map((p) => p[0])) - x0 + pad);
	const H = Math.round(Math.max(b.maxY, ...PTS.map((p) => p[1])) - y0 + pad);
	const dots = PTS.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="8" fill="${DOT}"/>`).join('');
	const inner = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>${dots}`;
	renderPng(frame(inner, x0, y0, W, H), 'assets/cornu-points.png');
	console.log('Wrote assets/cornu-points.png');
}

// --- 2. outline vs single-stroke ---------------------------------------
function makeModes(font) {
	const fontSize = 150;
	const a = font.segments('Cornu', { fontSize, detail: 5, singleStroke: false });
	const b = font.segments('Cornu', {
		fontSize,
		detail: 1,
		jitter: 5,
		seed: 7,
		singleStroke: true,
	});
	const ba = segmentBounds(a);
	const bb = segmentBounds(b);
	const gap = fontSize * 0.55;
	const bShift = translate(b, ba.minX - bb.minX, ba.maxY - bb.minY + gap);
	const all = [...a, ...bShift];
	const bnd = segmentBounds(all);
	const pad = 70;
	const x0 = bnd.minX - pad;
	const y0 = bnd.minY - pad;
	const W = Math.round(bnd.width + pad * 2);
	const H = Math.round(bnd.height + pad * 2);
	const inner =
		`<path d="${toPath(a)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
		`<path d="${toPath(bShift)}" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`;
	renderPng(frame(inner, x0, y0, W, H), 'assets/cornu-modes.png');
	console.log('Wrote assets/cornu-modes.png (top: outline, bottom: single-stroke)');
}

// --- 3. wobble loop -----------------------------------------------------
function makeWobble() {
	if (!has('ffmpeg', ['-version'])) {
		console.warn('ffmpeg not found — skipping cornu-wobble.gif');
		return;
	}
	const PTS = [
		[120, 250],
		[300, 90],
		[480, 270],
		[660, 90],
		[850, 240],
	];
	const amp = 26;
	const pad = 70;
	// Fixed frame covering the full wobble range so the box never moves.
	const x0 = Math.min(...PTS.map((p) => p[0])) - amp - pad;
	const y0 = Math.min(...PTS.map((p) => p[1])) - amp - pad;
	const W = Math.round(Math.max(...PTS.map((p) => p[0])) + amp + pad - x0);
	const H = Math.round(Math.max(...PTS.map((p) => p[1])) + amp + pad - y0);

	const DIR = join(tmpdir(), 'cornu-wobble-frames');
	rmSync(DIR, { recursive: true, force: true });
	mkdirSync(DIR, { recursive: true });
	const N = 60;
	for (let i = 0; i < N; i++) {
		const a = (2 * Math.PI * i) / N; // full loop -> seamless
		const live = PTS.map(([x, y], k) => [
			x + Math.sin(a + k * 1.7) * amp,
			y + Math.cos(a * 0.9 + k * 2.2) * amp,
		]);
		const d = cornuToSVGPath(live);
		const dots = live.map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="7" fill="${DOT}"/>`).join('');
		const inner = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>${dots}`;
		const png = new Resvg(frame(inner, x0, y0, W, H), {
			fitTo: { mode: 'width', value: RW },
		})
			.render()
			.asPng();
		writeFileSync(`${DIR}/frame_${String(i).padStart(3, '0')}.png`, png);
	}
	const palette = join(DIR, 'palette.png');
	execFileSync('ffmpeg', ['-y', '-framerate', '30', '-i', `${DIR}/frame_%03d.png`, '-vf', 'palettegen=stats_mode=full', palette], { stdio: 'ignore' });
	execFileSync('ffmpeg', ['-y', '-framerate', '30', '-i', `${DIR}/frame_%03d.png`, '-i', palette, '-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=3', '-loop', '0', 'assets/cornu-wobble.gif'], { stdio: 'ignore' });
	console.log('Wrote assets/cornu-wobble.gif');
}

function has(cmd, args) {
	try {
		execFileSync(cmd, args, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// --- run ----------------------------------------------------------------
if (!FONT || !existsSync(FONT)) {
	console.error('No font found; pass a path: node scripts/make-visuals.mjs "/path/Font.ttf"');
	process.exit(1);
}
const font = parseFont(new Uint8Array(readFileSync(FONT)));
makePoints();
makeModes(font);
makeWobble();
