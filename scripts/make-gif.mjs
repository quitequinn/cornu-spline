// Generate an animated "draw-on" GIF of Cornu-spline text. Emits one SVG per
// frame (stroke revealed via stroke-dashoffset), which the caller rasterizes
// and assembles with ffmpeg. Used only to produce README/demo art.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { parseFont } from '../dist/text.js';
import { cornuLength } from '../dist/index.js';

const FONT = process.argv[2];
const TEXT = process.argv[3] ?? 'Cornu';
const DIR = process.argv[4] ?? '/tmp/cornu-frames';
const FRAMES = 44;
const HOLD = 16; // extra frames held at the end

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });

const font = parseFont(new Uint8Array(readFileSync(FONT)));
const opts = { fontSize: 240, detail: 5, tweaks: 20 };
const { path, bounds, segments } = font.render(TEXT, opts);

// Per-contour lengths so the reveal runs evenly across the whole word.
const total = cornuLengthFromSegments(segments);
const pad = 50;
const vb = `${bounds.minX - pad} ${bounds.minY - pad} ${bounds.width + pad * 2} ${
	bounds.height + pad * 2
}`;
const W = Math.round(bounds.width + pad * 2);
const H = Math.round(bounds.height + pad * 2);

// easeInOutCubic
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const frame = (i) => {
	const p = i < FRAMES ? ease(i / (FRAMES - 1)) : 1;
	const offset = total * (1 - p);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${vb}">
  <rect x="${bounds.minX - pad}" y="${bounds.minY - pad}" width="${W}" height="${H}" fill="#0d0d12"/>
  <path d="${path}" fill="none" stroke="#7cf" stroke-width="6" stroke-linecap="round"
        stroke-dasharray="${total}" stroke-dashoffset="${offset}"/>
</svg>`;
	writeFileSync(`${DIR}/frame_${String(i).padStart(3, '0')}.svg`, svg);
};

const n = FRAMES + HOLD;
for (let i = 0; i < n; i++) frame(i);
console.log(`Wrote ${n} frames to ${DIR} (${W}x${H}, length ${Math.round(total)})`);

// Sum approximate arc length across already-fitted segments.
function cornuLengthFromSegments(segs) {
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

// silence unused import note: cornuLength is exported for library users; we
// reimplement over already-fitted segments here to avoid refitting per frame.
void cornuLength;
