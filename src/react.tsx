// react.tsx — React integration for cornu-spline.
// Exposes hooks (useCornuPath, useCornuSegments, useWobble, useFont) and
// components (<CornuPath>, <CornuText>) including draw-on and wobble animation.
import * as React from 'react';
import {
	cornuToSVGPath,
	cornuSegments,
	type InputPoint,
	type CornuOptions,
	type Segment,
} from './core';
import {
	CornuFont,
	loadFont,
	segmentBounds,
	type FontSource,
	type CornuTextOptions,
} from './text';

// --- Plain spline hooks -------------------------------------------------

/**
 * Memoized hook returning the SVG `d` string for a Cornu spline through the
 * given points. Recomputes only when points or options change.
 */
export function useCornuPath(
	points: InputPoint[],
	options: CornuOptions = {},
): string {
	const { closed, tweaks, flat } = options;
	return React.useMemo(
		() => cornuToSVGPath(points, { closed, tweaks, flat }),
		[points, closed, tweaks, flat],
	);
}

/** Memoized hook returning the raw drawing segments for a Cornu spline. */
export function useCornuSegments(
	points: InputPoint[],
	options: CornuOptions = {},
): Segment[] {
	const { closed, tweaks, flat } = options;
	return React.useMemo(
		() => cornuSegments(points, { closed, tweaks, flat }),
		[points, closed, tweaks, flat],
	);
}

// --- Animation ----------------------------------------------------------

const DRAW_KEYFRAMES_ID = 'cornu-spline-keyframes';

// Inject the draw-on keyframes once (browser only).
function ensureKeyframes(): void {
	if (typeof document === 'undefined') return;
	if (document.getElementById(DRAW_KEYFRAMES_ID)) return;
	const style = document.createElement('style');
	style.id = DRAW_KEYFRAMES_ID;
	style.textContent =
		'@keyframes cornu-draw-on{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}';
	document.head.appendChild(style);
}

/** Options for the draw-on (stroke reveal) animation. */
export interface DrawOptions {
	/** Duration in milliseconds. Default 1200. */
	duration?: number;
	/** Delay before starting, in milliseconds. Default 0. */
	delay?: number;
	/** CSS timing function. Default 'ease-in-out'. */
	easing?: string;
	/** Loop the animation forever. Default false. */
	loop?: boolean;
}

type DrawProp = boolean | DrawOptions;

// Build the inline style + attributes that drive the draw-on animation.
function drawStyle(draw: DrawProp | undefined): React.CSSProperties {
	if (!draw) return {};
	const o: DrawOptions = draw === true ? {} : draw;
	const { duration = 1200, delay = 0, easing = 'ease-in-out', loop = false } = o;
	ensureKeyframes();
	return {
		strokeDasharray: 1,
		strokeDashoffset: 1,
		animation: `cornu-draw-on ${duration}ms ${easing} ${delay}ms ${
			loop ? 'infinite' : 'forwards'
		}`,
	};
}

/** Options for the wobble animation. */
export interface WobbleOptions {
	/** Peak displacement, in the points' coordinate units. Default 4. */
	amount?: number;
	/** Oscillation speed multiplier. Default 1. */
	speed?: number;
}

type WobbleProp = number | WobbleOptions;

/**
 * Animate a set of points with smooth per-point oscillation. Returns a new
 * points array that updates each animation frame. Pass `0`/undefined to
 * disable (returns the input unchanged).
 */
export function useWobble(
	points: InputPoint[],
	wobble?: WobbleProp,
): InputPoint[] {
	const o: WobbleOptions =
		wobble == null || wobble === 0
			? { amount: 0 }
			: typeof wobble === 'number'
				? { amount: wobble }
				: wobble;
	const amount = o.amount ?? 4;
	const speed = o.speed ?? 1;

	const [tick, setTick] = React.useState(0);
	const enabled = amount > 0;

	React.useEffect(() => {
		if (!enabled || typeof requestAnimationFrame === 'undefined') return;
		let raf = 0;
		const loop = () => {
			setTick((t) => t + 1);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [enabled]);

	return React.useMemo(() => {
		if (!enabled) return points;
		const t = (typeof performance !== 'undefined' ? performance.now() : tick * 16) /
			1000;
		return points.map((p, i) => {
			const x = Array.isArray(p) ? p[0] : p.x;
			const y = Array.isArray(p) ? p[1] : p.y;
			const phase = i * 1.7;
			return [
				x + Math.sin(t * speed + phase) * amount,
				y + Math.cos(t * speed * 0.9 + phase * 1.3) * amount,
			] as InputPoint;
		});
		// `tick` drives the recompute each frame.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [points, amount, speed, enabled, tick]);
}

// --- <CornuPath> --------------------------------------------------------

/** Props for the <CornuPath /> component. */
export interface CornuPathProps
	extends Omit<React.SVGProps<SVGPathElement>, 'd' | 'points'> {
	/** Control points the spline passes through. */
	points: InputPoint[];
	/** Treat the points as a closed loop. */
	closed?: boolean;
	/** Smoothing iterations (default 20). */
	tweaks?: number;
	/** Emit a flat polyline instead of Bezier curves. */
	flat?: boolean;
	/** Animate the stroke drawing itself on. `true` or options. */
	draw?: DrawProp;
	/** Continuously wobble the control points. Number (amount) or options. */
	wobble?: WobbleProp;
}

/**
 * Renders a Cornu spline as an SVG <path>. Place inside an <svg> element.
 * All standard SVG path props (stroke, fill, strokeWidth, ...) are forwarded.
 */
export const CornuPath = React.forwardRef<SVGPathElement, CornuPathProps>(
	function CornuPath(
		{ points, closed, tweaks, flat, draw, wobble, style, ...rest },
		ref,
	) {
		const animated = useWobble(points, wobble);
		const d = useCornuPath(animated, { closed, tweaks, flat });
		const ds = drawStyle(draw);
		return (
			<path
				ref={ref}
				d={d}
				pathLength={draw ? 1 : undefined}
				style={{ ...ds, ...style }}
				{...rest}
			/>
		);
	},
);

// --- Fonts & text -------------------------------------------------------

/** Result of {@link useFont}. */
export interface UseFontResult {
	font: CornuFont | null;
	loading: boolean;
	error: Error | null;
}

/**
 * Load a font (URL, ArrayBuffer, or Uint8Array) and return it once ready.
 * Re-loads when the source changes.
 */
export function useFont(source: FontSource | null | undefined): UseFontResult {
	const [state, setState] = React.useState<UseFontResult>({
		font: null,
		loading: !!source,
		error: null,
	});

	React.useEffect(() => {
		if (!source) {
			setState({ font: null, loading: false, error: null });
			return;
		}
		let cancelled = false;
		setState({ font: null, loading: true, error: null });
		loadFont(source)
			.then((font) => {
				if (!cancelled) setState({ font, loading: false, error: null });
			})
			.catch((error: Error) => {
				if (!cancelled) setState({ font: null, loading: false, error });
			});
		return () => {
			cancelled = true;
		};
	}, [source]);

	return state;
}

/** Props for the <CornuText /> component. */
export interface CornuTextProps
	extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
	/** The text to render. */
	text: string;
	/** A loaded font, or a source (URL/buffer) to load. One is required. */
	font?: CornuFont | null;
	/** Font source if `font` is not supplied. */
	src?: FontSource;
	/** Font size in pixels. Default 72. */
	fontSize?: number;
	/** Curve sample density; lower = looser/sketchier. Default 3. */
	detail?: number;
	/** Random jitter in font units for an organic feel. Default 0. */
	jitter?: number;
	/** Seed for deterministic jitter. Default 1. */
	seed?: number;
	/** Smoothing iterations. Default 20. */
	tweaks?: number;
	/**
	 * Reproduce the original NodeBox look: one flowing open spline through the
	 * whole string instead of tidy per-glyph outlines. Pair with low `detail`.
	 */
	singleStroke?: boolean;
	/** Padding (px) added around the text in the SVG viewBox. Default 8. */
	padding?: number;
	/** Animate the stroke drawing on. */
	draw?: DrawProp;
	/** Props forwarded to the inner <path> (stroke, fill, strokeWidth, ...). */
	pathProps?: Omit<React.SVGProps<SVGPathElement>, 'd'>;
	/** Render only the <path> (no <svg> wrapper). Default false. */
	bare?: boolean;
	/** Rendered while a `src` font is still loading. */
	fallback?: React.ReactNode;
}

/**
 * Renders a string as a Cornu spline. Supply either a loaded `font` (from
 * useFont/loadFont) or a `src` to load. By default it returns a self-sizing
 * <svg>; pass `bare` to get just the <path>.
 */
export function CornuText({
	text,
	font: fontProp,
	src,
	fontSize = 72,
	detail = 3,
	jitter = 0,
	seed = 1,
	tweaks,
	singleStroke = false,
	padding = 8,
	draw,
	pathProps,
	bare = false,
	fallback = null,
	...svgProps
}: CornuTextProps): React.ReactElement | null {
	const loaded = useFont(fontProp ? null : src);
	const font = fontProp ?? loaded.font;

	const render = React.useMemo(() => {
		if (!font) return null;
		const options: CornuTextOptions = {
			fontSize,
			detail,
			jitter,
			seed,
			tweaks,
			singleStroke,
		};
		const segments = font.segments(text, options);
		return { segments, bounds: segmentBounds(segments) };
	}, [font, text, fontSize, detail, jitter, seed, tweaks, singleStroke]);

	if (!font || !render) return <>{fallback}</>;

	const f = (n: number) => {
		const r = Math.round(n * 1e4) / 1e4;
		return Object.is(r, -0) ? '0' : String(r);
	};
	let d = '';
	for (const s of render.segments) {
		if (s.type === 'moveto') d += `M ${f(s.x)} ${f(s.y)} `;
		else if (s.type === 'lineto') d += `L ${f(s.x)} ${f(s.y)} `;
		else d += `C ${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)} `;
	}
	d = d.trim();

	const ds = drawStyle(draw);
	const pathEl = (
		<path
			d={d}
			pathLength={draw ? 1 : undefined}
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			{...pathProps}
			style={{ ...ds, ...pathProps?.style }}
		/>
	);

	if (bare) return pathEl;

	const { minX, minY, width, height } = render.bounds;
	const vb = `${minX - padding} ${minY - padding} ${width + padding * 2} ${
		height + padding * 2
	}`;
	return (
		<svg viewBox={vb} {...svgProps}>
			{pathEl}
		</svg>
	);
}
