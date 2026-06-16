import { describe, it, expect } from 'vitest';
import {
	commandsToContours,
	commandsToCornuSegments,
	segmentBounds,
	type GlyphCommand,
} from '../src/text';

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
