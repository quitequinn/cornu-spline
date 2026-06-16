// react.tsx — React integration for cornu-spline.
// Exposes a useCornuPath() hook and a <CornuPath /> SVG component.
import * as React from 'react';
import {
	cornuToSVGPath,
	cornuSegments,
	type InputPoint,
	type CornuOptions,
	type Segment,
} from './core';

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
		// points are compared by reference; callers should memoize the array
		// or pass a stable reference for best performance.
		[points, closed, tweaks, flat],
	);
}

/**
 * Memoized hook returning the raw drawing segments for a Cornu spline.
 */
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
}

/**
 * Renders a Cornu spline as an SVG <path>. Place inside an <svg> element.
 * All standard SVG path props (stroke, fill, strokeWidth, ...) are forwarded.
 */
export const CornuPath = React.forwardRef<SVGPathElement, CornuPathProps>(
	function CornuPath({ points, closed, tweaks, flat, ...rest }, ref) {
		const d = useCornuPath(points, { closed, tweaks, flat });
		return <path ref={ref} d={d} {...rest} />;
	},
);
