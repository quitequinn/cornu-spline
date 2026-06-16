// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, renderHook } from '@testing-library/react';
import * as React from 'react';
import { CornuPath, CornuText, useWobble } from '../src/react';

afterEach(cleanup);

const POINTS: [number, number][] = [
	[0, 0],
	[100, 0],
	[100, 100],
	[0, 100],
];

describe('<CornuPath>', () => {
	it('renders an SVG path with a valid d attribute', () => {
		const { container } = render(
			<svg>
				<CornuPath points={POINTS} stroke="black" fill="none" />
			</svg>,
		);
		const path = container.querySelector('path');
		expect(path).not.toBeNull();
		expect(path!.getAttribute('d')!.startsWith('M ')).toBe(true);
		expect(path!.getAttribute('stroke')).toBe('black');
	});

	it('forwards a ref to the path element', () => {
		const ref = React.createRef<SVGPathElement>();
		render(
			<svg>
				<CornuPath points={POINTS} ref={ref} />
			</svg>,
		);
		expect(ref.current).not.toBeNull();
		expect(ref.current!.tagName.toLowerCase()).toBe('path');
	});

	it('sets up the draw-on animation and injects keyframes', () => {
		const { container } = render(
			<svg>
				<CornuPath points={POINTS} draw={{ duration: 800 }} />
			</svg>,
		);
		const path = container.querySelector('path')!;
		expect(path.getAttribute('pathLength')).toBe('1');
		expect(path.style.animation).toContain('cornu-draw-on');
		expect(path.style.animation).toContain('800ms');
		expect(document.getElementById('cornu-spline-keyframes')).not.toBeNull();
	});

	it('still renders a path when wobble is enabled', () => {
		const { container } = render(
			<svg>
				<CornuPath points={POINTS} wobble={3} />
			</svg>,
		);
		expect(container.querySelector('path')!.getAttribute('d')).toMatch(/^M /);
	});
});

describe('useWobble', () => {
	it('returns the input unchanged when disabled', () => {
		const { result } = renderHook(() => useWobble(POINTS, 0));
		expect(result.current).toBe(POINTS);
	});

	it('returns displaced points when enabled', () => {
		const { result } = renderHook(() => useWobble(POINTS, 5));
		expect(result.current).not.toBe(POINTS);
		expect(result.current).toHaveLength(POINTS.length);
	});
});

describe('<CornuText>', () => {
	it('renders the fallback while a src font is loading', () => {
		const { getByText } = render(
			<CornuText src="/does-not-exist.ttf" text="Hi" fallback={<span>loading</span>} />,
		);
		expect(getByText('loading')).toBeTruthy();
	});
});
