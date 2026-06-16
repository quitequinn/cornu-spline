import { describe, it, expect } from 'vitest';
import { cornuSegments, cornuToSVGPath, cornuToCanvas } from '../src/index';

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
});
