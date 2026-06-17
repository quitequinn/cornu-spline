// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { render, cleanup, renderHook } from '@testing-library/react';
import * as React from 'react';
import { CornuPath, CornuText, useWobble } from '../src/react';
import { parseFont } from '../src/text';

afterEach(cleanup);

const FONT_PATH = 'docs/font.ttf';
const font = existsSync(FONT_PATH)
	? parseFont(new Uint8Array(readFileSync(FONT_PATH)))
	: null;
const withFont = font ? describe : describe.skip;

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

withFont('<CornuText> (font-backed accessibility)', () => {
	it('renders an accessible <svg> with role, aria-label, and <title>', () => {
		const { container } = render(<CornuText font={font} text="Hi" />);
		const svg = container.querySelector('svg')!;
		expect(svg.getAttribute('role')).toBe('img');
		expect(svg.getAttribute('aria-label')).toBe('Hi');
		expect(container.querySelector('title')?.textContent).toBe('Hi');
		expect(container.querySelector('path')?.getAttribute('d')).toMatch(/^M /);
	});

	it('labels the bare <path> output', () => {
		const { container } = render(<CornuText font={font} text="Hi" bare />);
		const path = container.querySelector('path')!;
		expect(path.getAttribute('role')).toBe('img');
		expect(path.getAttribute('aria-label')).toBe('Hi');
	});

	it('renders the fallback for empty text', () => {
		const { getByText } = render(
			<CornuText font={font} text="" fallback={<span>empty</span>} />,
		);
		expect(getByText('empty')).toBeTruthy();
	});
});
