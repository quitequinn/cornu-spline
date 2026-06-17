import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
	commandsToContours,
	commandsToCornuSegments,
	segmentBounds,
	parseFont,
	type GlyphCommand,
} from '../src/text';

// The demo font ships in the repo; use it for font-backed tests when present.
const FONT_PATH = 'docs/font.ttf';
const font = existsSync(FONT_PATH)
	? parseFont(new Uint8Array(readFileSync(FONT_PATH)))
	: null;
const withFont = font ? describe : describe.skip;

// Two glyph-like contours: an open stroke and a closed triangle.
const COMMANDS: GlyphCommand[] = [
	{ type: 'M', x: 0, y: 0 },
	{ type: 'L', x: 50, y: 10 },
	{ type: 'C', x1: 60, y1: 40, x2: 80, y2: 60, x: 100, y: 50 },
	{ type: 'M', x: 0, y: 100 },
	{ type: 'L', x: 40, y: 140 },
	{ type: 'L', x: -40, y: 140 },
	{ type: 'Z' },
];

describe('commandsToContours', () => {
	it('splits on M and Z into separate contours', () => {
		const contours = commandsToContours(COMMANDS, 3);
		expect(contours).toHaveLength(2);
		expect(contours[0].closed).toBe(false);
		expect(contours[1].closed).toBe(true);
	});

	it('samples curves at the requested detail', () => {
		const low = commandsToContours(COMMANDS, 1)[0].points.length;
		const high = commandsToContours(COMMANDS, 8)[0].points.length;
		expect(high).toBeGreaterThan(low);
	});

	it('drops a trailing point coincident with the contour start', () => {
		const cmds: GlyphCommand[] = [
			{ type: 'M', x: 0, y: 0 },
			{ type: 'L', x: 10, y: 0 },
			{ type: 'L', x: 10, y: 10 },
			{ type: 'L', x: 0, y: 0 },
			{ type: 'Z' },
		];
		const c = commandsToContours(cmds, 1)[0];
		expect(c.closed).toBe(true);
		// start (0,0), (10,0), (10,10) — the closing (0,0) is removed.
		expect(c.points).toHaveLength(3);
	});
});

describe('commandsToCornuSegments', () => {
	it('produces fitted segments across all contours', () => {
		const segs = commandsToCornuSegments(COMMANDS);
		expect(segs.length).toBeGreaterThan(0);
		// One moveto per contour.
		expect(segs.filter((s) => s.type === 'moveto')).toHaveLength(2);
	});

	it('is deterministic for a given seed and varies with jitter', () => {
		const a = commandsToCornuSegments(COMMANDS, { jitter: 5, seed: 7 });
		const b = commandsToCornuSegments(COMMANDS, { jitter: 5, seed: 7 });
		const c = commandsToCornuSegments(COMMANDS, { jitter: 5, seed: 99 });
		expect(b).toEqual(a);
		expect(c).not.toEqual(a);
	});

	it('produces only finite coordinates', () => {
		for (const s of commandsToCornuSegments(COMMANDS, { jitter: 3 })) {
			for (const v of Object.values(s)) {
				if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
			}
		}
	});

	it('singleStroke fits one open spline through the whole string', () => {
		const multi = commandsToCornuSegments(COMMANDS);
		const single = commandsToCornuSegments(COMMANDS, { singleStroke: true });
		// Per-contour mode has one moveto per contour; singleStroke has exactly one.
		expect(multi.filter((s) => s.type === 'moveto').length).toBe(2);
		expect(single.filter((s) => s.type === 'moveto').length).toBe(1);
	});
});

describe('layoutLines', () => {
	// A tiny fake font: every char is 10 units wide at the given size.
	const fakeFont = {
		getAdvanceWidth: (t: string) => t.length * 10,
	} as unknown as import('opentype.js').Font;

	it('splits on newlines when no maxWidth', async () => {
		const { layoutLines } = await import('../src/text');
		expect(layoutLines(fakeFont, 'a\nb\nc', 72)).toEqual(['a', 'b', 'c']);
	});

	it('word-wraps to maxWidth', async () => {
		const { layoutLines } = await import('../src/text');
		// each word 3 chars (30) + space; maxWidth 70 fits two words ("foo bar" = 70)
		const lines = layoutLines(fakeFont, 'foo bar baz qux', 72, 70);
		expect(lines.length).toBeGreaterThan(1);
		expect(lines.join(' ')).toBe('foo bar baz qux');
	});

	it('preserves blank lines', async () => {
		const { layoutLines } = await import('../src/text');
		expect(layoutLines(fakeFont, 'a\n\nb', 72)).toEqual(['a', '', 'b']);
	});
});

describe('segmentBounds', () => {
	it('computes a bounding box that contains the geometry', () => {
		const segs = commandsToCornuSegments(COMMANDS);
		const b = segmentBounds(segs);
		expect(b.width).toBeGreaterThan(0);
		expect(b.height).toBeGreaterThan(0);
		expect(b.maxX).toBeGreaterThanOrEqual(b.minX);
	});

	it('returns a zero box for empty input', () => {
		expect(segmentBounds([])).toEqual({
			minX: 0,
			minY: 0,
			maxX: 0,
			maxY: 0,
			width: 0,
			height: 0,
		});
	});
});

withFont('CornuFont.renderParagraph (font-backed)', () => {
	it('wraps long text into multiple lines', () => {
		const r = font!.renderParagraph('the quick brown fox jumps over lazy dogs', {
			fontSize: 40,
			maxWidth: 200,
		});
		expect(r.lines.length).toBeGreaterThan(1);
		expect(r.segments.length).toBeGreaterThan(0);
		expect(r.bounds.height).toBeGreaterThan(40);
		expect(r.path.startsWith('M ')).toBe(true);
	});

	it('singleStroke produces one open spline per non-blank line', () => {
		const segs = font!.paragraphSegments('ab\ncd', {
			fontSize: 40,
			detail: 1,
			singleStroke: true,
		});
		expect(segs.filter((s) => s.type === 'moveto')).toHaveLength(2);
	});

	it('blank lines still advance the baseline', () => {
		const r = font!.renderParagraph('a\n\nb', { fontSize: 40 });
		expect(r.lines).toEqual(['a', '', 'b']);
		expect(r.segments.length).toBeGreaterThan(0);
	});

	it('right alignment shifts lines further right than left alignment', () => {
		const opts = { fontSize: 40, maxWidth: 400 } as const;
		const left = font!.renderParagraph('hi', { ...opts, align: 'left' });
		const right = font!.renderParagraph('hi', { ...opts, align: 'right' });
		expect(right.bounds.minX).toBeGreaterThan(left.bounds.minX + 100);
	});
});
