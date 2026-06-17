import { describe, it, expect } from 'vitest';
import {
	cornuSegments,
	cornuToSVGPath,
	segmentsToSVGPath,
	cornuToCanvas,
	cornuToPath2D,
	cornuLength,
	type Segment,
} from '../src/index';

// All vertex coordinates a segment list passes through (knots live here).
function vertices(segs: Segment[]): [number, number][] {
	return segs
		.filter((s) => s.type !== 'lineto')
		.map((s) => [s.x, s.y] as [number, number]);
}
function nearestDist(pt: [number, number], pts: [number, number][]): number {
	return Math.min(...pts.map(([x, y]) => Math.hypot(x - pt[0], y - pt[1])));
}

const SQUARE: [number, number][] = [
	[0, 0],
	[100, 0],
	[100, 100],
	[0, 100],
];

describe('cornuSegments', () => {
	it('returns empty for fewer than two points', () => {
		expect(cornuSegments([])).toEqual([]);
		expect(cornuSegments([[0, 0]])).toEqual([]);
	});

	it('starts with a single moveto', () => {
		const segs = cornuSegments(SQUARE);
		expect(segs.length).toBeGreaterThan(1);
		expect(segs[0].type).toBe('moveto');
		expect(segs.filter((s) => s.type === 'moveto')).toHaveLength(1);
	});

	it('emits curveto segments by default and lineto when flat', () => {
		const curved = cornuSegments(SQUARE);
		expect(curved.some((s) => s.type === 'curveto')).toBe(true);

		const flat = cornuSegments(SQUARE, { flat: true });
		expect(flat.some((s) => s.type === 'lineto')).toBe(true);
		expect(flat.some((s) => s.type === 'curveto')).toBe(false);
	});

	it('accepts {x,y} objects equivalently to tuples', () => {
		const a = cornuSegments(SQUARE);
		const b = cornuSegments(SQUARE.map(([x, y]) => ({ x, y })));
		expect(b).toEqual(a);
	});

	it('produces only finite coordinates', () => {
		for (const s of cornuSegments(SQUARE, { closed: true })) {
			for (const v of Object.values(s)) {
				if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
			}
		}
	});

	it('passes the curve through the first and last control points', () => {
		const segs = cornuSegments(SQUARE);
		const first = segs[0] as { x: number; y: number };
		expect(first.x).toBeCloseTo(0, 6);
		expect(first.y).toBeCloseTo(0, 6);
		const last = segs[segs.length - 1] as { x: number; y: number };
		expect(last.x).toBeCloseTo(0, 6);
		expect(last.y).toBeCloseTo(100, 6);
	});

	it('interpolates EVERY control point, not just the endpoints', () => {
		const verts = vertices(cornuSegments(SQUARE));
		for (const p of SQUARE) {
			expect(nearestDist(p, verts)).toBeLessThan(1e-3);
		}
	});

	it('handles a minimal two-point input', () => {
		const segs = cornuSegments([
			[0, 0],
			[100, 0],
		]);
		expect(segs.length).toBeGreaterThan(0);
		const first = segs[0] as { x: number; y: number };
		expect(first.x).toBeCloseTo(0, 3);
		expect(first.y).toBeCloseTo(0, 3);
		const last = segs[segs.length - 1] as { x: number; y: number };
		expect(last.x).toBeCloseTo(100, 3);
		expect(last.y).toBeCloseTo(0, 3);
	});

	it('returns to the start when closed', () => {
		const segs = cornuSegments(SQUARE, { closed: true });
		const last = segs[segs.length - 1] as { x: number; y: number };
		expect(Math.hypot(last.x - 0, last.y - 0)).toBeLessThan(1e-3);
	});

	it('terminates on duplicate non-finite points (no infinite loop)', () => {
		// Regression: Set-based dedupe must not spin on NaN keys.
		expect(() =>
			cornuSegments([
				[NaN, NaN],
				[NaN, NaN],
				[0, 0],
				[100, 0],
			]),
		).not.toThrow();
	});

	it('does not throw on duplicate points', () => {
		const segs = cornuSegments([
			[0, 0],
			[0, 0],
			[100, 0],
		]);
		expect(segs.every((s) => Number.isFinite(s.x) && Number.isFinite(s.y))).toBe(
			true,
		);
	});
});

describe('cornuLength (golden)', () => {
	it('matches the straight-line distance for two points', () => {
		expect(cornuLength([[0, 0], [100, 0]])).toBeCloseTo(100, 1);
	});
});

describe('segmentsToSVGPath', () => {
	it('serializes segments without re-fitting', () => {
		const segs = cornuSegments(SQUARE);
		expect(segmentsToSVGPath(segs)).toBe(cornuToSVGPath(SQUARE));
		expect(segmentsToSVGPath(segs, true).endsWith('Z')).toBe(true);
	});

	it('never emits NaN/Infinity/exponential tokens', () => {
		const d = segmentsToSVGPath([
			{ type: 'moveto', x: NaN, y: 0 },
			{ type: 'curveto', x1: Infinity, y1: -Infinity, x2: 1e30, y2: 1e-30, x: 5, y: 5 },
		]);
		expect(d).not.toMatch(/NaN|Infinity/);
		expect(d).not.toMatch(/e[+-]?\d/i);
	});
});

describe('cornuToSVGPath', () => {
	it('begins with M and contains curve commands', () => {
		const d = cornuToSVGPath(SQUARE);
		expect(d.startsWith('M ')).toBe(true);
		expect(d).toContain('C ');
	});

	it('appends Z when closed', () => {
		expect(cornuToSVGPath(SQUARE, { closed: true }).endsWith('Z')).toBe(true);
	});

	it('returns empty string for too few points', () => {
		expect(cornuToSVGPath([[0, 0]])).toBe('');
	});
});

describe('cornuLength', () => {
	it('returns a positive length and is zero for too few points', () => {
		expect(cornuLength(SQUARE)).toBeGreaterThan(0);
		expect(cornuLength([[0, 0]])).toBe(0);
	});

	it('grows when the closing segment is added', () => {
		const open = cornuLength(SQUARE);
		const closed = cornuLength(SQUARE, { closed: true });
		expect(closed).toBeGreaterThan(open);
	});
});

describe('cornuToPath2D', () => {
	it('throws when Path2D is unavailable (node)', () => {
		// jsdom/node has no Path2D by default.
		if (typeof Path2D === 'undefined') {
			expect(() => cornuToPath2D(SQUARE)).toThrow(/Path2D/);
		} else {
			expect(cornuToPath2D(SQUARE)).toBeInstanceOf(Path2D);
		}
	});
});

describe('cornuToCanvas', () => {
	it('drives a canvas-like context', () => {
		const calls: string[] = [];
		const ctx = {
			moveTo: () => calls.push('move'),
			lineTo: () => calls.push('line'),
			bezierCurveTo: () => calls.push('curve'),
			closePath: () => calls.push('close'),
		};
		cornuToCanvas(ctx, SQUARE, { closed: true });
		expect(calls[0]).toBe('move');
		expect(calls).toContain('curve');
		expect(calls[calls.length - 1]).toBe('close');
	});

	it('does not require closePath on the context', () => {
		const ctx = {
			moveTo: () => {},
			lineTo: () => {},
			bezierCurveTo: () => {},
		};
		expect(() => cornuToCanvas(ctx, SQUARE, { closed: true })).not.toThrow();
	});
});
