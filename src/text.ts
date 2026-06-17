// text.ts — turn any string into a Cornu spline by sampling a font's glyph
// outlines and running the sample points through the Cornu fitter. This is the
// browser equivalent of the original NodeBox `textpath(...)` -> cornu demo.
//
// Depends on opentype.js (a peer/runtime dependency) only in this entry; the
// core `cornu-spline` entry stays dependency-free.
// Types come from @types/opentype.js (DefinitelyTyped, 1.3.x — there is no v2
// typings package). They cover the v2 runtime API we use (parse, Font,
// getPath, getAdvanceWidth, RenderOptions); the interop shim below bridges the
// ESM/CJS shape difference.
import * as opentype from 'opentype.js';
import {
	cornuSegments,
	segmentsToSVGPath,
	type Segment,
	type CornuOptions,
} from './core';

// Runtime interop: the ESM build of opentype.js exposes its functions under a
// `default` export, while CJS exposes them at the top level. Resolve whichever
// is present. Types still come from the `opentype` namespace (erased at build).
const ot: typeof opentype =
	(opentype as unknown as { default?: typeof opentype }).default ?? opentype;

// Resolve opentype's `parse` lazily (only the font-loading paths need it), so
// importing the pure helpers doesn't require opentype to be present, and so
// there's no top-level side effect that could trip tree-shaking.
function requireParse(): typeof opentype.parse {
	if (typeof ot?.parse !== 'function') {
		throw new Error(
			'cornu-spline: could not resolve opentype.js `parse()`. Ensure opentype.js v2 is installed and resolvable.',
		);
	}
	return ot.parse;
}

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
	/**
	 * Origin y of the text baseline. opentype's y axis grows downward and most
	 * of each glyph sits *above* the baseline (smaller y), with descenders
	 * below. Defaults to `fontSize` so the ascenders land near y=0. The exact
	 * extent depends on the font's metrics; size your viewBox from the returned
	 * bounds rather than assuming it.
	 */
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
	/**
	 * Reproduce the original NodeBox `cornu` demo: instead of fitting each
	 * glyph contour as its own closed outline, run a single *open* Cornu
	 * spline through every on-curve point of the whole string (contour
	 * boundaries ignored). The result is a flowing, ribbon-like
	 * reinterpretation rather than tidy letterforms — this is the signature
	 * Cornu look. Pair with a low `detail` (1–2) and a little `jitter`.
	 * Default false.
	 */
	singleStroke?: boolean;
	/**
	 * Text directionality. `'rtl'` reverses the visual order so a single
	 * right-to-left run renders correctly — this works for non-joining scripts
	 * (e.g. Hebrew). It does NOT perform complex shaping: joining scripts
	 * (Arabic) and reordering scripts (Indic) need a shaping engine (HarfBuzz);
	 * for mixed-direction text, run a bidi pass yourself and pass the visual
	 * order with `'ltr'`. Default `'ltr'`.
	 */
	direction?: 'ltr' | 'rtl';
	/** opentype.js render options (kerning, ligatures, ...). */
	fontOptions?: opentype.RenderOptions;
}

/** Options for laying out multi-line text / paragraphs. */
export interface CornuParagraphOptions extends CornuTextOptions {
	/** Line height as a multiple of `fontSize`. Default 1.3. */
	lineHeight?: number;
	/** Max line width (px) for word wrapping. Omit to break only on "\n". */
	maxWidth?: number;
	/** Horizontal alignment (needs `maxWidth` for center/right). Default "left". */
	align?: 'left' | 'center' | 'right';
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
	const { detail = 3, jitter = 0, seed = 1, tweaks, flat, singleStroke = false } =
		options;
	const rng = makeRng(seed);
	const contours = commandsToContours(commands, detail);

	const jit = (pts: [number, number][]): [number, number][] =>
		jitter > 0
			? pts.map(([x, y]) => [
					x + (rng() * 2 - 1) * jitter,
					y + (rng() * 2 - 1) * jitter,
				])
			: pts;

	// Original NodeBox behaviour: one open spline through every on-curve point
	// of the whole string, contour boundaries ignored.
	if (singleStroke) {
		const pts = jit(contours.flatMap((c) => c.points));
		return cornuSegments(pts, { closed: false, tweaks, flat });
	}

	// Default: fit each glyph contour as its own (closed) outline.
	const segments: Segment[] = [];
	for (const contour of contours) {
		segments.push(
			...cornuSegments(jit(contour.points), {
				closed: contour.closed,
				tweaks,
				flat,
			}),
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

// Serialize already-fitted segments to an SVG path `d` string. Shares the
// single implementation in core so formatting never drifts.
const segmentsToPath = (segments: Segment[]): string =>
	segmentsToSVGPath(segments);

/**
 * Break text into laid-out lines: split on "\n", then greedily word-wrap each
 * paragraph to `maxWidth` (measured with the font). Blank lines are preserved.
 */
export function layoutLines(
	font: opentype.Font,
	text: string,
	fontSize: number,
	maxWidth?: number,
	fontOptions?: opentype.RenderOptions,
): string[] {
	const paragraphs = text.split('\n');
	if (!maxWidth) return paragraphs;
	const lines: string[] = [];
	for (const para of paragraphs) {
		const words = para.split(/\s+/).filter(Boolean);
		if (words.length === 0) {
			lines.push('');
			continue;
		}
		let line = words[0];
		for (let i = 1; i < words.length; i++) {
			const test = `${line} ${words[i]}`;
			if (font.getAdvanceWidth(test, fontSize, fontOptions) <= maxWidth) {
				line = test;
			} else {
				lines.push(line);
				line = words[i];
			}
		}
		lines.push(line);
	}
	return lines;
}

/**
 * Reorder a single-direction run for rendering. For `'rtl'` it reverses the
 * Unicode code points so opentype's left-to-right glyph placement produces a
 * right-to-left visual order — correct for non-joining scripts such as Hebrew.
 * Joining/complex scripts (Arabic, Indic) need a shaping engine and are not
 * handled here; for mixed-direction text, run a bidi algorithm first and pass
 * the result with `'ltr'`.
 */
export function visualOrder(text: string, direction: 'ltr' | 'rtl' = 'ltr'): string {
	// Array.from splits on code points (keeps surrogate pairs intact).
	return direction === 'rtl' ? Array.from(text).reverse().join('') : text;
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
		const t = visualOrder(text, options.direction);
		return this.font.getPath(t, x, y, fontSize, options.fontOptions)
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

	/**
	 * Cornu spline segments for multi-line text: splits on "\n" and optionally
	 * word-wraps to `maxWidth`, stacking lines by `lineHeight`. Each line is
	 * fitted independently (so `singleStroke` flows per line, not across lines).
	 */
	paragraphSegments(text: string, options: CornuParagraphOptions = {}): Segment[] {
		const lines = layoutLines(
			this.font,
			text,
			options.fontSize ?? 72,
			options.maxWidth,
			options.fontOptions,
		);
		return this.linesToSegments(lines, options);
	}

	// Fit pre-wrapped lines to stacked Cornu segments. Shared by
	// paragraphSegments and renderParagraph so layout runs only once.
	private linesToSegments(
		lines: string[],
		options: CornuParagraphOptions,
	): Segment[] {
		const fontSize = options.fontSize ?? 72;
		const lineHeight = (options.lineHeight ?? 1.3) * fontSize;
		const x0 = options.x ?? 0;
		const y0 = options.y ?? fontSize;
		// RTL text defaults to right alignment.
		const align = options.align ?? (options.direction === 'rtl' ? 'right' : 'left');
		const out: Segment[] = [];
		lines.forEach((line, i) => {
			if (!line) return; // blank line still advances the baseline below
			let x = x0;
			if (options.maxWidth && align !== 'left') {
				const w = this.font.getAdvanceWidth(line, fontSize, options.fontOptions);
				x = x0 + (options.maxWidth - w) * (align === 'center' ? 0.5 : 1);
			}
			out.push(...this.segments(line, { ...options, x, y: y0 + i * lineHeight }));
		});
		return out;
	}

	/** Multi-line segments plus path and bounding box (layout computed once). */
	renderParagraph(
		text: string,
		options: CornuParagraphOptions = {},
	): { segments: Segment[]; path: string; bounds: Bounds; lines: string[] } {
		const lines = layoutLines(
			this.font,
			text,
			options.fontSize ?? 72,
			options.maxWidth,
			options.fontOptions,
		);
		const segments = this.linesToSegments(lines, options);
		return {
			segments,
			path: segmentsToPath(segments),
			bounds: segmentBounds(segments),
			lines,
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
	return new CornuFont(requireParse()(buffer));
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
	return new CornuFont(requireParse()(buffer));
}
