// Reproducible hero-GIF builder: text -> Cornu spline -> SVG frames (draw-on
// reveal) -> rasterize (exact size, no clipping) -> assemble GIF.
//
// Usage:
//   node scripts/make-gif.mjs [fontPath] [text] [outGif]
//   npm run gif -- "/path/to/Font.ttf" "Cornu" assets/cornu-draw.gif
//
// Requires: ffmpeg for encoding. SVG rasterizing uses @resvg/resvg-js (devDep),
// which renders at exact dimensions — the curve stays fully contained.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { parseFont } from '../dist/text.js';

// --- args & style -------------------------------------------------------
const DEFAULT_FONTS = [
	'/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf',
	'/Library/Fonts/Arial.ttf',
];
const FONT = process.argv[2] || DEFAULT_FONTS.find((f) => existsSync(f));
const TEXT = process.argv[3] ?? 'Cornu';
const OUT = process.argv[4] ?? 'assets/cornu-draw.gif';

const STYLE = {
	fontSize: 240,
	stroke: '#111111',
	strokeWidth: 3.5,
	background: '#ffffff',
	frame: '#e6e6e6', // subtle container border
	pad: 150, // generous margin so the curve stays well inside
	inset: 30, // distance from canvas edge to the container frame
	frames: 44,
	hold: 16,
	fps: 24,
	rasterWidth: 1000,
};

if (!FONT || !existsSync(FONT)) {
	console.error(
		`No font found. Pass a path:\n  npm run gif -- "/path/to/Font.ttf" "${TEXT}"`,
	);
	process.exit(1);
}

// --- fit & frames -------------------------------------------------------
const DIR = join(tmpdir(), 'cornu-gif-frames');
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const font = parseFont(new Uint8Array(readFileSync(FONT)));
// Original NodeBox direction: one flowing open spline through the whole word.
const opts = {
	fontSize: STYLE.fontSize,
	detail: 1,
	tweaks: 20,
	singleStroke: true,
	jitter: 5,
	seed: 7,
};
const { path, bounds, segments } = font.render(TEXT, opts);
const total = approxLength(segments);

const { pad, inset } = STYLE;
const x0 = bounds.minX - pad;
const y0 = bounds.minY - pad;
const W = Math.round(bounds.width + pad * 2);
const H = Math.round(bounds.height + pad * 2);
const vb = `${x0} ${y0} ${W} ${H}`;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const n = STYLE.frames + STYLE.hold;
for (let i = 0; i < n; i++) {
	const p = i < STYLE.frames ? ease(i / (STYLE.frames - 1)) : 1;
	const offset = total * (1 - p);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb}">
  <rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="${STYLE.background}"/>
  <rect x="${x0 + inset}" y="${y0 + inset}" width="${W - inset * 2}" height="${H - inset * 2}" rx="28"
        fill="none" stroke="${STYLE.frame}" stroke-width="2"/>
  <path d="${path}" fill="none" stroke="${STYLE.stroke}" stroke-width="${STYLE.strokeWidth}" stroke-linecap="round"
        stroke-dasharray="${total}" stroke-dashoffset="${offset}"/>
</svg>`;
	// Exact-size raster — no padding/cropping, so nothing gets clipped.
	const png = new Resvg(svg, {
		fitTo: { mode: 'width', value: STYLE.rasterWidth },
	})
		.render()
		.asPng();
	writeFileSync(`${DIR}/frame_${String(i).padStart(3, '0')}.png`, png);
}
console.log(`Rendered ${n} frames (${W}x${H} viewBox) in ${DIR}`);

// --- encode -------------------------------------------------------------
if (!has('ffmpeg', ['-version'])) {
	console.error(`ffmpeg not found. PNG frames left in ${DIR}.`);
	process.exit(1);
}
const palette = join(DIR, 'palette.png');
execFileSync('ffmpeg', [
	'-y', '-framerate', String(STYLE.fps),
	'-i', `${DIR}/frame_%03d.png`,
	'-vf', 'palettegen=stats_mode=full', palette,
], { stdio: 'ignore' });
execFileSync('ffmpeg', [
	'-y', '-framerate', String(STYLE.fps),
	'-i', `${DIR}/frame_%03d.png`, '-i', palette,
	'-lavfi', '[0:v][1:v]paletteuse=dither=bayer:bayer_scale=3',
	'-loop', '0', OUT,
], { stdio: 'ignore' });
console.log(`Wrote ${OUT}`);

// --- helpers ------------------------------------------------------------
function has(cmd, args) {
	try {
		execFileSync(cmd, args, { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
}

// Approximate arc length of fitted segments (for the dash reveal).
function approxLength(segs) {
	let length = 0;
	let px = 0;
	let py = 0;
	for (const s of segs) {
		if (s.type === 'moveto') {
			px = s.x;
			py = s.y;
		} else if (s.type === 'lineto') {
			length += Math.hypot(s.x - px, s.y - py);
			px = s.x;
			py = s.y;
		} else {
			let lx = px;
			let ly = py;
			for (let k = 1; k <= 16; k++) {
				const t = k / 16;
				const u = 1 - t;
				const x = u * u * u * px + 3 * u * u * t * s.x1 + 3 * u * t * t * s.x2 + t * t * t * s.x;
				const y = u * u * u * py + 3 * u * u * t * s.y1 + 3 * u * t * t * s.y2 + t * t * t * s.y;
				length += Math.hypot(x - lx, y - ly);
				lx = x;
				ly = y;
			}
			px = s.x;
			py = s.y;
		}
	}
	return length;
}
