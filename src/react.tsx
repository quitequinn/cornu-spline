// react.tsx — React integration for cornu-spline.
// Hooks (useCornuPath, useCornuSegments, useWobble, useFont) and components
// (<CornuPath>, <CornuText>) with draw-on / wobble animation that respects
// prefers-reduced-motion and exposes accessible text alternatives.
import * as React from 'react';
import {
	cornuToSVGPath,
	cornuSegments,
	type InputPoint,
	type CornuOptions,
	type Segment,
} from './core';
import { CornuFont, loadFont, type FontSource } from './text';

// --- Plain spline hooks -------------------------------------------------

/**
 * Memoized hook returning the SVG `d` string for a Cornu spline through the
 * given points. Recomputes only when points or options change. (Pass a stable
 * `points` reference so it doesn't refit on every parent render.)
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

// --- Animation utilities ------------------------------------------------

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

/** Live `prefers-reduced-motion: reduce` state, updating on change. */
export function usePrefersReducedMotion(): boolean {
	const query = '(prefers-reduced-motion: reduce)';
	// Initialize `false` on both server and first client render to avoid a
	// hydration mismatch; sync to the real value in an effect after mount.
	const [reduced, setReduced] = React.useState(false);
	React.useEffect(() => {
		if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
			return;
		const mq = window.matchMedia(query);
		const onChange = () => setReduced(mq.matches);
		onChange();
		mq.addEventListener?.('change', onChange);
		return () => mq.removeEventListener?.('change', onChange);
	}, []);
	return reduced;
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

// Build the CSS `animation` shorthand for the draw-on reveal.
function drawAnimation(draw: DrawProp): string {
	const o: DrawOptions = typeof draw === 'object' ? draw : {};
	const { duration = 1200, delay = 0, easing = 'ease-in-out', loop = false } = o;
	return `cornu-draw-on ${duration}ms ${easing} ${delay}ms ${
		loop ? 'infinite' : 'forwards'
	}`;
}

/** Options for the wobble animation. */
export interface WobbleOptions {
	/** Peak displacement, in the points' coordinate units. Default 4. */
	amount?: number;
	/** Oscillation speed multiplier. Default 1. */
	speed?: number;
}

type WobbleProp = number | WobbleOptions;

function normalizeWobble(wobble: WobbleProp | undefined): {
	amount: number;
	speed: number;
} {
	if (wobble == null || wobble === 0) return { amount: 0, speed: 1 };
	if (typeof wobble === 'number') return { amount: wobble, speed: 1 };
	return { amount: wobble.amount ?? 4, speed: wobble.speed ?? 1 };
}

const toTuple = (p: InputPoint): [number, number] =>
	Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y];

/**
 * Animate a set of points with smooth per-point oscillation, returning a new
 * points array each animation frame. NOTE: this re-renders the consuming
 * component every frame; for rendering a single spline prefer `<CornuPath
 * wobble>`, which animates imperatively without per-frame React renders.
 * Respects `prefers-reduced-motion` (returns the input unchanged).
 */
export function useWobble(
	points: InputPoint[],
	wobble?: WobbleProp,
): InputPoint[] {
	const { amount, speed } = normalizeWobble(wobble);
	const reduced = usePrefersReducedMotion();
	const [tick, setTick] = React.useState(0);
	const enabled = amount > 0 && !reduced;

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
		const t =
			(typeof performance !== 'undefined' ? performance.now() : tick * 16) / 1000;
		return points.map((p, i) => {
			const [x, y] = toTuple(p);
			const phase = i * 1.7;
			return [
				x + Math.sin(t * speed + phase) * amount,
				y + Math.cos(t * speed * 0.9 + phase * 1.3) * amount,
			] as InputPoint;
		});
		// `tick` is the per-frame recompute trigger.
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
 * Wobble animates imperatively (no per-frame React re-render); draw-on
 * re-triggers when the geometry changes. Both honor prefers-reduced-motion.
 */
export const CornuPath = React.forwardRef<SVGPathElement, CornuPathProps>(
	function CornuPath(
		{ points, closed, tweaks, flat, draw, wobble, ...rest },
		ref,
	) {
		const reduced = usePrefersReducedMotion();
		const innerRef = React.useRef<SVGPathElement | null>(null);
		const setRef = React.useCallback(
			(el: SVGPathElement | null) => {
				innerRef.current = el;
				if (typeof ref === 'function') ref(el);
				else if (ref) ref.current = el;
			},
			[ref],
		);

		const baseD = useCornuPath(points, { closed, tweaks, flat });
		const { amount, speed } = normalizeWobble(wobble);
		const wobbleOn = amount > 0 && !reduced;
		const drawActive = !!draw && !wobbleOn && !reduced;

		// Wobble: rewrite the `d` attribute each frame imperatively — no React
		// state, so the component does not re-render per frame.
		React.useEffect(() => {
			if (!wobbleOn || typeof requestAnimationFrame === 'undefined') return;
			const tuples = points.map(toTuple);
			let raf = 0;
			const loop = () => {
				const t = (typeof performance !== 'undefined' ? performance.now() : 0) / 1000;
				const live = tuples.map(([x, y], i) => [
					x + Math.sin(t * speed + i * 1.7) * amount,
					y + Math.cos(t * speed * 0.9 + i * 2.2) * amount,
				]) as InputPoint[];
				innerRef.current?.setAttribute(
					'd',
					cornuToSVGPath(live, { closed, tweaks, flat }),
				);
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
			return () => {
				cancelAnimationFrame(raf);
				innerRef.current?.setAttribute('d', baseD);
			};
		}, [wobbleOn, points, amount, speed, closed, tweaks, flat, baseD]);

		// Draw-on: (re)trigger whenever the geometry changes.
		React.useEffect(() => {
			const el = innerRef.current;
			if (!el) return;
			if (!drawActive) {
				el.style.animation = '';
				el.style.strokeDasharray = '';
				el.style.strokeDashoffset = '';
				return;
			}
			ensureKeyframes();
			el.style.strokeDasharray = '1';
			el.style.strokeDashoffset = '1';
			el.style.animation = 'none';
			void el.getBoundingClientRect(); // force reflow so the animation restarts
			el.style.animation = draw ? drawAnimation(draw) : '';
		}, [drawActive, baseD, draw]);

		return (
			<path ref={setRef} d={baseD} pathLength={drawActive ? 1 : undefined} {...rest} />
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
	/** Baseline origin x. Default 0. */
	x?: number;
	/** Baseline origin y. Default fontSize. */
	y?: number;
	/** Curve sample density; lower = looser/sketchier. Default 3. */
	detail?: number;
	/** Random jitter in font units for an organic feel. Default 0. */
	jitter?: number;
	/** Seed for deterministic jitter. Default 1. */
	seed?: number;
	/** Smoothing iterations. Default 20. */
	tweaks?: number;
	/** Emit a flat polyline instead of Bezier curves. */
	flat?: boolean;
	/** opentype.js render options (kerning, ligatures, ...). */
	fontOptions?: import('./text').CornuTextOptions['fontOptions'];
	/**
	 * Reproduce the original NodeBox look: one flowing open spline through the
	 * whole string instead of tidy per-glyph outlines. Pair with low `detail`.
	 */
	singleStroke?: boolean;
	/** Max line width (px) for word wrapping. Enables multi-line layout. */
	maxWidth?: number;
	/** Line height as a multiple of fontSize (multi-line). Default 1.3. */
	lineHeight?: number;
	/** Horizontal alignment for wrapped lines. Default "left" ("right" for rtl). */
	align?: 'left' | 'center' | 'right';
	/** Text directionality. "rtl" reverses visual order (non-joining scripts). */
	direction?: 'ltr' | 'rtl';
	/** Padding (px) added around the text in the SVG viewBox. Default 8. */
	padding?: number;
	/** Animate the stroke drawing on. */
	draw?: DrawProp;
	/** Props forwarded to the inner <path> (stroke, fill, strokeWidth, ...). */
	pathProps?: Omit<React.SVGProps<SVGPathElement>, 'd'>;
	/** Render only the <path> (no <svg> wrapper). Default false. */
	bare?: boolean;
	/** Rendered while a `src` font is loading, on load error, or empty text. */
	fallback?: React.ReactNode;
}

/**
 * Renders a string as a Cornu spline. Supply either a loaded `font` (from
 * useFont/loadFont) or a `src` to load. By default it returns a self-sizing,
 * accessible <svg> (role="img", aria-label = text, <title>); pass `bare` to get
 * just the <path>.
 */
export function CornuText({
	text,
	font: fontProp,
	src,
	fontSize = 72,
	x,
	y,
	detail = 3,
	jitter = 0,
	seed = 1,
	tweaks,
	flat,
	fontOptions,
	singleStroke = false,
	maxWidth,
	lineHeight,
	align,
	direction,
	padding = 8,
	draw,
	pathProps,
	bare = false,
	fallback = null,
	...svgProps
}: CornuTextProps): React.ReactElement | null {
	const loaded = useFont(fontProp ? null : src);
	const font = fontProp ?? loaded.font;
	const reduced = usePrefersReducedMotion();
	const pathRef = React.useRef<SVGPathElement | null>(null);

	const render = React.useMemo(() => {
		if (!font) return null;
		// renderParagraph handles single- and multi-line uniformly and returns a
		// ready-made path string (no need to re-serialize here).
		return font.renderParagraph(text, {
			fontSize,
			x,
			y,
			detail,
			jitter,
			seed,
			tweaks,
			flat,
			fontOptions,
			singleStroke,
			maxWidth,
			lineHeight,
			align,
			direction,
		});
	}, [
		font, text, fontSize, x, y, detail, jitter, seed, tweaks, flat,
		fontOptions, singleStroke, maxWidth, lineHeight, align, direction,
	]);

	const path = render && render.segments.length > 0 ? render.path : null;
	const drawActive = !!draw && !reduced && !!path;

	// Draw-on: (re)trigger imperatively whenever the geometry changes, mirroring
	// CornuPath. Keeps render pure (no ensureKeyframes/DOM work during render).
	React.useEffect(() => {
		const el = pathRef.current;
		if (!el) return;
		if (!drawActive) {
			el.style.animation = '';
			el.style.strokeDasharray = '';
			el.style.strokeDashoffset = '';
			return;
		}
		ensureKeyframes();
		el.style.strokeDasharray = '1';
		el.style.strokeDashoffset = '1';
		el.style.animation = 'none';
		void el.getBoundingClientRect();
		el.style.animation = draw ? drawAnimation(draw) : '';
	}, [drawActive, path, draw]);

	// Nothing to draw: still loading, load error, or empty/whitespace text.
	if (!font || !path || !render) return <>{fallback}</>;

	const pathEl = (
		<path
			ref={pathRef}
			d={path}
			pathLength={drawActive ? 1 : undefined}
			fill="none"
			stroke="currentColor"
			strokeWidth={2}
			{...(bare ? { role: 'img', 'aria-label': text } : {})}
			{...pathProps}
		/>
	);

	if (bare) return pathEl;

	const { minX, minY, width, height } = render.bounds;
	const vb = `${minX - padding} ${minY - padding} ${width + padding * 2} ${
		height + padding * 2
	}`;
	return (
		<svg role="img" aria-label={text} viewBox={vb} {...svgProps}>
			<title>{text}</title>
			{pathEl}
		</svg>
	);
}
