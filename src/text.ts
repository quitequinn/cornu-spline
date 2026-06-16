// text.ts — turn any string into a Cornu spline by sampling a font's glyph
// outlines and running the sample points through the Cornu fitter. This is the
// browser equivalent of the original NodeBox `textpath(...)` -> cornu demo.
//
// Depends on opentype.js (a peer/runtime dependency) only in this entry; the
// core `cornu-spline` entry stays dependency-free.
import * as opentype from 'opentype.js';
import {
	cornuSegments,
	type Segment,
	type CornuOptions,
} from './core';

// Runtime interop: the ESM build of opentype.js exposes its functions under a
// `default` export, while CJS exposes them at the top level. Resolve whichever
// is present. Types still come from the `opentype` namespace (erased at build).
const ot: typeof opentype =
	(opentype as unknown as { default?: typeof opentype }).default ?? opentype;

/** A glyph path command as produced by opentype.js `Path.commands`. */
export interface GlyphCommand {
	type: 'M' | 'L' | 'C' | 'Q' | 'Z';
	x?: number;
	y?: number;
	x1?: number;
	y1?: number;
	x2?: number;
	y2?: number;
}

/** A single extracted contour: its sample points and whether it is closed. */
export interface Contour {
	points: [number, number][];
	closed: boolean;
}

/** Options for converting text/glyph outlines into a Cornu spline. */
export interface CornuTextOptions extends Pick<CornuOptions, 'tweaks' | 'flat'> {
	/** Font size in font units (pixels). Default 72. */
	fontSize?: number;
	/** Origin x (baseline). Default 0. */
	x?: number;
	/** Origin y (baseline). Default fontSize (so glyphs sit below y=0). */
	y?: number;
	/**
	 * Sample points generated per curve command. Lower = looser, more
	 * "hand-drawn" interpretation; higher = closer to the true outline.
	 * Default 3.
	 */
	detail?: number;
	/**
	 * Random jitter (in font units) applied to every sample point, for an
	 * organic, sketchy feel. Default 0 (off).
	 */
	jitter?: number;
	/** Seed for deterministic jitter. Default 1. */
	seed?: number;
	/** opentype.js render options (kerning, ligatures, ...). */
	fontOptions?: opentype.RenderOptions;
}

// Small deterministic PRNG (mulberry32) so jitter is reproducible per seed.
function makeRng(seed: number): () => number {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// Sample a cubic Bezier (excluding the start point) into `detail` points.
function sampleCubic(
	x0: number, y0: number, x1: number, y1: number,
	x2: number, y2: number, x3: number, y3: number, detail: number,
): [number, number][] {
	const out: [number, number][] = [];
	const steps = Math.max(1, detail);
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const u = 1 - t;
		const a = u * u * u;
		const b = 3 * u * u * t;
		const c = 3 * u * t * t;
		const d = t * t * t;
		out.push([
			a * x0 + b * x1 + c * x2 + d * x3,
			a * y0 + b * y1 + c * y2 + d * y3,
		]);
	}
	return out;
}

// Sample a quadratic Bezier (excluding the start point) into `detail` points.
function sampleQuad(
	x0: number, y0: number, x1: number, y1: number,
	x2: number, y2: number, detail: number,
): [number, number][] {
	const out: [number, number][] = [];
	const steps = Math.max(1, detail);
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const u = 1 - t;
		out.push([
			u * u * x0 + 2 * u * t * x1 + t * t * x2,
			u * u * y0 + 2 * u * t * y1 + t * t * y2,
		]);
	}
	return out;
}

/**
 * Split a flat list of glyph commands into contours, sampling curves at the
 * given detail. Pure and font-independent — handy for testing.
 */
export function commandsToContours(
	commands: GlyphCommand[],
	detail = 3,
): Contour[] {
	const contours: Contour[] = [];
	let cur: [number, number][] = [];
	let closed = false;
	let cx = 0;
	let cy = 0;
	let sx = 0;
	let sy = 0;

	const flush = () => {
		if (cur.length > 1) contours.push({ points: cur, closed });
		cur = [];
		closed = false;
	};

	for (const cmd of commands) {
		switch (cmd.type) {
			case 'M':
				flush();
				cx = sx = cmd.x ?? 0;
				cy = sy = cmd.y ?? 0;
				cur = [[cx, cy]];
				break;
			case 'L':
				cx = cmd.x ?? 0;
				cy = cmd.y ?? 0;
				cur.push([cx, cy]);
				break;
			case 'C':
				cur.push(
					...sampleCubic(
						cx, cy, cmd.x1 ?? 0, cmd.y1 ?? 0,
						cmd.x2 ?? 0, cmd.y2 ?? 0, cmd.x ?? 0, cmd.y ?? 0, detail,
					),
				);
				cx = cmd.x ?? 0;
				cy = cmd.y ?? 0;
				break;
			case 'Q':
				cur.push(
					...sampleQuad(
						cx, cy, cmd.x1 ?? 0, cmd.y1 ?? 0, cmd.x ?? 0, cmd.y ?? 0, detail,
					),
				);
				cx = cmd.x ?? 0;
				cy = cmd.y ?? 0;
				break;
			case 'Z':
				closed = true;
				// Drop a trailing point coincident with the start; closed Cornu
				// loops want distinct knots.
				if (
					cur.length > 1 &&
					cur[cur.length - 1][0] === sx &&
					cur[cur.length - 1][1] === sy
				) {
					cur.pop();
				}
				cx = sx;
				cy = sy;
				flush();
				break;
		}
	}
	flush();
	return contours;
}

/**
 * Convert a flat list of glyph commands directly into Cornu spline segments,
 * one fitted contour after another. Pure and font-independent.
 */
export function commandsToCornuSegments(
	commands: GlyphCommand[],
	options: CornuTextOptions = {},
): Segment[] {
	const { detail = 3, jitter = 0, seed = 1, tweaks, flat } = options;
	const rng = makeRng(seed);
	const contours = commandsToContours(commands, detail);
	const segments: Segment[] = [];
	for (const contour of contours) {
		let pts = contour.points;
		if (jitter > 0) {
			pts = pts.map(([x, y]) => [
				x + (rng() * 2 - 1) * jitter,
				y + (rng() * 2 - 1) * jitter,
			]);
		}
		segments.push(
			...cornuSegments(pts, { closed: contour.closed, tweaks, flat }),
		);
	}
	return segments;
}

/** Axis-aligned bounding box of a list of segments. */
export interface Bounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

/** Compute the bounding box of fitted segments. */
export function segmentBounds(segments: Segment[]): Bounds {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const acc = (x: number, y: number) => {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	};
	for (const s of segments) {
		if (s.type === 'curveto') {
			acc(s.x1, s.y1);
			acc(s.x2, s.y2);
		}
		acc(s.x, s.y);
	}
	if (!Number.isFinite(minX)) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// Render segments to an SVG path `d` string (mirrors core.cornuToSVGPath but
// works on already-fitted segments so we don't refit per contour).
function segmentsToPath(segments: Segment[]): string {
	const f = (n: number) => {
		const r = Math.round(n * 1e4) / 1e4;
		return Object.is(r, -0) ? '0' : String(r);
	};
	let d = '';
	for (const s of segments) {
		if (s.type === 'moveto') d += `M ${f(s.x)} ${f(s.y)} `;
		else if (s.type === 'lineto') d += `L ${f(s.x)} ${f(s.y)} `;
		else d += `C ${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)} `;
	}
	return d.trim();
}

/** A loaded font ready to produce Cornu splines from text. */
export class CornuFont {
	/** The underlying opentype.js Font. */
	readonly font: opentype.Font;

	constructor(font: opentype.Font) {
		this.font = font;
	}

	/** Glyph commands for a string at the given size/origin. */
	commands(text: string, options: CornuTextOptions = {}): GlyphCommand[] {
		const fontSize = options.fontSize ?? 72;
		const x = options.x ?? 0;
		const y = options.y ?? fontSize;
		return this.font.getPath(text, x, y, fontSize, options.fontOptions)
			.commands as GlyphCommand[];
	}

	/** Cornu spline segments for a string. */
	segments(text: string, options: CornuTextOptions = {}): Segment[] {
		return commandsToCornuSegments(this.commands(text, options), options);
	}

	/** SVG path `d` string for a string. */
	toSVGPath(text: string, options: CornuTextOptions = {}): string {
		return segmentsToPath(this.segments(text, options));
	}

	/** Segments plus their bounding box (useful for sizing an SVG viewBox). */
	render(
		text: string,
		options: CornuTextOptions = {},
	): { segments: Segment[]; path: string; bounds: Bounds } {
		const segments = this.segments(text, options);
		return {
			segments,
			path: segmentsToPath(segments),
			bounds: segmentBounds(segments),
		};
	}
}

/** Accepted font sources for {@link loadFont}. */
export type FontSource = string | ArrayBuffer | Uint8Array;

/**
 * Load a font from a URL (browser/node fetch), an ArrayBuffer, or a Uint8Array
 * and return a {@link CornuFont}.
 */
export async function loadFont(source: FontSource): Promise<CornuFont> {
	let buffer: ArrayBuffer;
	if (typeof source === 'string') {
		const res = await fetch(source);
		if (!res.ok) throw new Error(`Failed to fetch font: ${source} (${res.status})`);
		buffer = await res.arrayBuffer();
	} else if (source instanceof Uint8Array) {
		buffer = source.buffer.slice(
			source.byteOffset,
			source.byteOffset + source.byteLength,
		) as ArrayBuffer;
	} else {
		buffer = source;
	}
	return new CornuFont(ot.parse(buffer));
}

/** Parse a font already in memory (ArrayBuffer/Uint8Array) synchronously. */
export function parseFont(data: ArrayBuffer | Uint8Array): CornuFont {
	const buffer =
		data instanceof Uint8Array
			? (data.buffer.slice(
					data.byteOffset,
					data.byteOffset + data.byteLength,
			  ) as ArrayBuffer)
			: data;
	return new CornuFont(ot.parse(buffer));
}
