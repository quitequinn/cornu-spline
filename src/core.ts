// core.ts — framework-agnostic Cornu (Euler-spiral) spline math.
// Ported from the NodeBox "cornu" library: Cornu curves by Raph Levien,
// Cornu-to-Bezier conversion by Mark Meyer. This port drops NodeBox's
// canvas-relative coordinate scaling so points stay in their own space.

/** A control point as a tuple. */
export type PointTuple = [number, number];
/** A control point as an object. */
export type PointObject = { x: number; y: number };
/** Accepted input point shape: tuple or object. */
export type InputPoint = PointTuple | PointObject;

/** Options controlling how the spline is fitted and emitted. */
export interface CornuOptions {
	/** Treat the point list as a closed loop. Default false. */
	closed?: boolean;
	/** Number of smoothing iterations. Higher is smoother. Default 20. */
	tweaks?: number;
	/** Emit a flat polyline (many lineto) instead of Bezier curves. Default false. */
	flat?: boolean;
}

/** A single drawing instruction emitted by the fitter. */
export type Segment =
	| { type: 'moveto'; x: number; y: number }
	| { type: 'lineto'; x: number; y: number }
	| {
			type: 'curveto';
			x1: number;
			y1: number;
			x2: number;
			y2: number;
			x: number;
			y: number;
	  };

// Internal point representation used throughout the math.
type Pt = [number, number];

// --- CORNU math ---------------------------------------------------------

// Fit arc to pts (0, 0), (x, y), and (1, 0); return tangent at (x, y).
function fitArc(x: number, y: number): number {
	return Math.atan2(y - 2 * x * y, y * y + x - x * x);
}

// Find tangent thetas along the path using local cspline logic.
function localThs(path: Pt[], closed: boolean): number[] {
	const c = closed ? 1 : 0;
	const n = path.length;
	const result: number[] = closed ? [] : [0];
	for (let i = 1 - c; i < n - 1 + c; i++) {
		const [x0, y0] = path[(i + n - 1) % n];
		const [x1, y1] = path[i];
		const [x2, y2] = path[(i + 1) % n];
		const dx = x2 - x0;
		const dy = y2 - y0;
		let ir2 = dx * dx + dy * dy;
		ir2 = Math.max(ir2, 0.0001);
		const x = ((x1 - x0) * dx + (y1 - y0) * dy) / ir2;
		const y = ((y1 - y0) * dx - (x1 - x0) * dy) / ir2;
		const th = fitArc(x, y) + Math.atan2(dy, dx);
		result.push(th);
	}
	if (!closed) result.push(0);
	boundaryThs(path, result, closed);
	return result;
}

// Set the endpoint thetas so endpoint curves are circular arcs.
function boundaryThs(path: Pt[], ths: number[], closed: boolean): void {
	if (!closed) {
		const firstTh =
			2 * Math.atan2(path[1][1] - path[0][1], path[1][0] - path[0][0]) - ths[1];
		ths[0] = firstTh;
		const n = path.length;
		const lastTh =
			2 *
				Math.atan2(
					path[n - 1][1] - path[n - 2][1],
					path[n - 1][0] - path[n - 2][0],
				) -
			ths[n - 2];
		ths[n - 1] = lastTh;
	}
}

// Evaluate a polynomial (cephes-style Horner). coef[0] is the constant term.
function polevl(x: number, coef: number[]): number {
	let ans = coef[coef.length - 1];
	for (let i = coef.length - 2; i >= 0; i--) ans = ans * x + coef[i];
	return ans;
}

// Cephes Fresnel-integral coefficients. Stored in source order then reversed,
// matching the original Python so polevl receives lowest-degree-first.
const sn = [
	-2.99181919401019853726e3, 7.0884004525773857686e5, -6.29741486205862506537e7,
	2.5489088057337635910e9, -4.42979518059697779103e10, 3.18016297876567817986e11,
].reverse();
const sd = [
	1.0, 2.81376268889994315696e2, 4.55847810806532581675e4,
	5.1734388877009640073e6, 4.19320245898111231129e8, 2.2441179564534092094e10,
	6.07366389490084639049e11,
].reverse();
const cn = [
	-4.98843114573573548651e-8, 9.50428062829859605134e-6,
	-6.45191435683965050962e-4, 1.88843319396703850064e-2,
	-2.05525900955013891793e-1, 9.99999999999999998822e-1,
].reverse();
const cd = [
	3.99982968972495980367e-12, 9.15439215774657478799e-10,
	1.25001862479598821474e-7, 1.22262789024179030997e-5,
	8.68029542941784300606e-4, 4.12142090722199792936e-2,
	1.00000000000000000118,
].reverse();
const fn = [
	4.21543555043677546506e-1, 1.43407919780758885261e-1,
	1.15220955073585758835e-2, 3.450179397825740279e-4, 4.63613749287867322088e-6,
	3.05568983790257605827e-8, 1.02304514164907233465e-10,
	1.72010743268161828879e-13, 1.34283276233062758925e-16,
	3.76329711269987889006e-20,
].reverse();
const fd = [
	1.0, 7.51586398353378947175e-1, 1.16888925859191382142e-1,
	6.44051526508858611005e-3, 1.55934409164153020873e-4, 1.8462756734893054587e-6,
	1.12699224763999035261e-8, 3.60140029589371370404e-11,
	5.8875453362157841001e-14, 4.52001434074129701496e-17,
	1.25443237090011264384e-20,
].reverse();
const gn = [
	5.04442073643383265887e-1, 1.97102833525523411709e-1,
	1.87648584092575249293e-2, 6.84079380915393090172e-4,
	1.15138826111884280931e-5, 9.82852443688422223854e-8,
	4.45344415861750144738e-10, 1.08268041139020870318e-12,
	1.37555460633261799868e-15, 8.36354435630677421531e-19,
	1.86958710162783235106e-22,
].reverse();
const gd = [
	1.0, 1.47495759925128324529, 3.37748989120019970451e-1,
	2.53603741420338795122e-2, 8.14679107184306179049e-4, 1.27545075667729118702e-5,
	1.04314589657571990585e-7, 4.60680728146520428211e-10,
	1.10273215066240270757e-12, 1.38796531259578871258e-15,
	8.39158816283118707363e-19, 1.86958710162783236342e-22,
].reverse();

// Fresnel integral. Returns [S, C].
function fresnel(xxa: number): [number, number] {
	const x = Math.abs(xxa);
	const x2 = x * x;
	let ss: number;
	let cc: number;
	if (x2 < 2.5625) {
		const t = x2 * x2;
		ss = (x * x2 * polevl(t, sn)) / polevl(t, sd);
		cc = (x * polevl(t, cn)) / polevl(t, cd);
	} else if (x > 36974.0) {
		ss = 0.5;
		cc = 0.5;
	} else {
		let t = Math.PI * x2;
		const u = 1.0 / (t * t);
		t = 1.0 / t;
		const f = 1.0 - (u * polevl(u, fn)) / polevl(u, fd);
		const g = t * polevl(u, gn) / polevl(u, gd);
		t = Math.PI * 0.5 * x2;
		const c = Math.cos(t);
		const s = Math.sin(t);
		t = Math.PI * x;
		cc = 0.5 + (f * s - g * c) / t;
		ss = 0.5 - (f * c + g * s) / t;
	}
	if (xxa < 0) {
		cc = -cc;
		ss = -ss;
	}
	return [ss, cc];
}

// Evaluate the Cornu spiral at parameter t. Returns [s, c].
function evalCornu(t: number): [number, number] {
	const spio2 = Math.sqrt(Math.PI * 0.5);
	let [s, c] = fresnel(t / spio2);
	s *= spio2;
	c *= spio2;
	return [s, c];
}

// Reduce an angle to the range (-pi, pi].
function mod2pi(th: number): number {
	const u = th / (2 * Math.PI);
	return 2 * Math.PI * (u - Math.floor(u + 0.5));
}

// Fit half a Cornu spiral between two tangent angles. Returns [t0, t1, k0, k1].
function fitCornuHalf(
	th0: number,
	th1: number,
): [number, number, number, number] {
	if (th0 + th1 < 1e-6) {
		const epsilon = 1e-6;
		th0 += epsilon;
		th1 += epsilon;
	}
	let nIter = 0;
	const nIterMax = 21;
	const estTm = (0.29112 * (th1 + th0)) / Math.sqrt(th1 - th0);
	let l = estTm * 0.9;
	let r = estTm * 2;
	let t0 = 0;
	let t1 = 0;
	let s0 = 0;
	let c0 = 0;
	let s1 = 0;
	let c1 = 0;
	while (true) {
		const tM = 0.5 * (l + r);
		const dt = (th0 + th1) / (4 * tM);
		t0 = tM - dt;
		t1 = tM + dt;
		// invariant: t1^2 - t0^2 = th0 + th1
		[s0, c0] = evalCornu(t0);
		[s1, c1] = evalCornu(t1);
		const chordTh = Math.atan2(s1 - s0, c1 - c0);
		nIter += 1;
		if (nIter === nIterMax) break;
		if (mod2pi(chordTh - t0 * t0 - th0) < 0) {
			l = tM;
		} else {
			r = tM;
		}
	}
	const chordlen = Math.hypot(s1 - s0, c1 - c0);
	const k0 = t0 * chordlen;
	const k1 = t1 * chordlen;
	return [t0, t1, k0, k1];
}

// Emitter interface used by the drawing routines.
interface Emitter {
	moveto(x: number, y: number): void;
	lineto(x: number, y: number): void;
	curveto(x1: number, y1: number, x2: number, y2: number, x: number, y: number): void;
}

// Build the spline path into the emitter.
function drawCornu(
	path: Pt[],
	ths: number[],
	closed: boolean,
	flat: boolean,
	out: Emitter,
): void {
	const n = path.length;
	const segs = n - 1 + (closed ? 1 : 0);
	let started = false;
	for (let i = 0; i < segs; i++) {
		const [x0, y0] = path[i];
		const [x1, y1] = path[(i + 1) % n];
		const th = Math.atan2(y1 - y0, x1 - x0);
		let th0 = mod2pi(ths[i] - th);
		let th1 = mod2pi(th - ths[(i + 1) % n]);
		let flip = -1;
		th1 += 1e-6;
		if (th1 < th0) {
			[th0, th1] = [th1, th0];
			flip = 1;
		}
		let [t0, t1] = fitCornuHalf(th0, th1);
		if (flip === 1) {
			[t0, t1] = [t1, t0];
		}
		let [s0, c0] = evalCornu(t0);
		s0 *= flip;
		let [s1, c1] = evalCornu(t1);
		s1 *= flip;
		const chordTh = Math.atan2(s1 - s0, c1 - c0);
		const chordlen = Math.hypot(s1 - s0, c1 - c0);
		const rot = th - chordTh;
		const scale = Math.hypot(y1 - y0, x1 - x0) / chordlen;
		const cs = scale * Math.cos(rot);
		const ss = scale * Math.sin(rot);
		if (flat) {
			started = drawCornuFlat(x0, y0, t0, t1, s0, c0, flip, cs, ss, started, out);
		} else {
			started = drawCornuBezier(
				x0, y0, t0, t1, s0, c0, flip, cs, ss, started, scale, rot, out,
			);
		}
	}
}

// Raph Levien's flat LINETO segments.
function drawCornuFlat(
	x0: number, y0: number, t0: number, t1: number, s0: number, c0: number,
	flip: number, cs: number, ss: number, started: boolean, out: Emitter,
): boolean {
	for (let j = 0; j < 100; j++) {
		const t = j * 0.01;
		let [s, c] = evalCornu(t0 + t * (t1 - t0));
		s *= flip;
		s -= s0;
		c -= c0;
		const x = c * cs - s * ss;
		const y = s * cs + c * ss;
		if (!started) {
			out.moveto(x0 + x, y0 + y);
			started = true;
		} else {
			out.lineto(x0 + x, y0 + y);
		}
	}
	return started;
}

// Mark Meyer's elegant CURVETO segments.
function drawCornuBezier(
	x0: number, y0: number, t0: number, t1: number, s0: number, c0: number,
	flip: number, cs: number, ss: number, started: boolean,
	scale: number, rot: number, out: Emitter,
): boolean {
	let have = false;
	let x = 0;
	let y = 0;
	let dx1 = 0;
	let dy1 = 0;
	for (let j = 0; j < 5; j++) {
		// travel along the function two points at a time (time t and t2)
		const t = j * 0.2;
		const t2 = t + 0.2;
		const curvetime = t0 + t * (t1 - t0);
		const curvetime2 = t0 + t2 * (t1 - t0);
		const Dt = (curvetime2 - curvetime) * scale;
		if (!have) {
			// get first point; avoid recomputing on later iterations
			let [s, c] = evalCornu(curvetime);
			s *= flip;
			s -= s0;
			c -= c0;
			// derivative of the Fresnel integrand gives the tangent slope
			dx1 = Math.cos(Math.pow(curvetime, 2) + flip * rot);
			dy1 = flip * Math.sin(Math.pow(curvetime, 2) + flip * rot);
			x = c * cs - s * ss + x0;
			y = s * cs + c * ss + y0;
			have = true;
		}
		// look ahead to the next point on the spiral
		let [s2, c2] = evalCornu(curvetime2);
		s2 *= flip;
		s2 -= s0;
		c2 -= c0;
		const dx2 = Math.cos(Math.pow(curvetime2, 2) + flip * rot);
		const dy2 = flip * Math.sin(Math.pow(curvetime2, 2) + flip * rot);
		const x3 = c2 * cs - s2 * ss + x0;
		const y3 = s2 * cs + c2 * ss + y0;
		// control points
		const cx1 = x + (Dt / 3.0) * dx1;
		const cy1 = y + (Dt / 3.0) * dy1;
		const cx2 = x3 - (Dt / 3.0) * dx2;
		const cy2 = y3 - (Dt / 3.0) * dy2;
		if (!started) {
			out.moveto(x, y);
			started = true;
		}
		out.curveto(cx1, cy1, cx2, cy2, x3, y3);
		dx1 = dx2;
		dy1 = dy2;
		x = x3;
		y = y3;
	}
	return started;
}

// Update thetas based on Cornu splines.
function tweakThs(path: Pt[], ths: number[], closed: boolean): void {
	const n = path.length;
	const dks: number[] = [];
	let firstK0 = 0;
	let lastK1 = 0;
	const segs = n - 1 + (closed ? 1 : 0);
	for (let i = 0; i < segs; i++) {
		const [x0, y0] = path[i];
		const [x1, y1] = path[(i + 1) % n];
		const th = Math.atan2(y1 - y0, x1 - x0);
		let th0 = mod2pi(ths[i] - th);
		let th1 = mod2pi(th - ths[(i + 1) % n]);
		let flip = -1;
		th1 += 1e-6;
		if (th1 < th0) {
			[th0, th1] = [th1, th0];
			flip = 1;
		}
		let [t0, t1, k0, k1] = fitCornuHalf(th0, th1);
		if (flip === 1) {
			[t0, t1] = [t1, t0];
			[k0, k1] = [k1, k0];
		}
		// The original evaluates the spiral here only to derive a chord
		// length it never uses; the thetas tweak depends solely on the
		// scaled curvatures k0/k1, so we skip that dead computation.
		const scale = 1 / Math.max(Math.hypot(y1 - y0, x1 - x0), 0.0001);
		k0 *= scale;
		k1 *= scale;
		if (i > 0) {
			dks.push(k0 - lastK1);
		} else {
			firstK0 = k0;
		}
		lastK1 = k1;
	}
	if (closed) {
		dks.push(firstK0 - lastK1);
	}
	for (let i = 0; i < dks.length; i++) {
		const [x0, y0] = path[i];
		const [x1, y1] = path[(i + 1) % n];
		const [x2, y2] = path[(i + 2) % n];
		const chord1 = Math.hypot(x1 - x0, y1 - y0);
		const chord2 = Math.hypot(x2 - x1, y2 - y1);
		ths[(i + 1) % n] -= 0.5 * (dks[i] / (chord1 + chord2));
	}
}

// --- Public API ---------------------------------------------------------

// Normalize any accepted input point to an internal tuple.
function toPt(p: InputPoint): Pt {
	if (Array.isArray(p)) return [p[0], p[1]];
	return [p.x, p.y];
}

// Nudge exact-duplicate points apart to avoid zero-length chords (which
// would divide by zero in the fitter). O(n) via a coordinate-keyed Set.
function dedupe(points: Pt[]): Pt[] {
	const out: Pt[] = [];
	const seen = new Set<string>();
	for (const [x, y] of points) {
		let nx = x;
		let ny = y;
		// Guard on finiteness: nudging a non-finite coordinate never changes the
		// key, so only loop while the values can actually move.
		while (seen.has(`${nx},${ny}`) && Number.isFinite(nx) && Number.isFinite(ny)) {
			nx += 1e-9;
			ny += 1e-9;
		}
		seen.add(`${nx},${ny}`);
		out.push([nx, ny]);
	}
	return out;
}

/**
 * Fit a Cornu (Euler-spiral) spline through the given points and return the
 * drawing instructions (moveto / lineto / curveto) in the points' own
 * coordinate space.
 */
export function cornuSegments(
	points: InputPoint[],
	options: CornuOptions = {},
): Segment[] {
	const { closed = false, tweaks = 20, flat = false } = options;
	const pts = dedupe(points.map(toPt));
	if (pts.length < 2) return [];

	const ths = localThs(pts, closed);
	for (let i = 0; i < tweaks; i++) {
		boundaryThs(pts, ths, closed);
		tweakThs(pts, ths, closed);
	}
	boundaryThs(pts, ths, closed);

	const segments: Segment[] = [];
	const out: Emitter = {
		moveto: (x, y) => segments.push({ type: 'moveto', x, y }),
		lineto: (x, y) => segments.push({ type: 'lineto', x, y }),
		curveto: (x1, y1, x2, y2, x, y) =>
			segments.push({ type: 'curveto', x1, y1, x2, y2, x, y }),
	};
	drawCornu(pts, ths, closed, flat, out);
	return segments;
}

// Format a number for an SVG path: trim noise to 4dp, avoid "-0", and never
// emit non-finite or exponential tokens (both invalid in an SVG `d`).
function formatCoord(n: number): string {
	if (!Number.isFinite(n)) return '0';
	const r = Math.round(n * 1e4) / 1e4;
	if (Object.is(r, -0) || r === 0) return '0';
	// `String` only uses exponential notation for |x| >= 1e21 (after 4dp
	// rounding the smallest non-zero is 1e-4, which is never exponential), so
	// expand only the pathological large case to keep the SVG `d` token valid.
	return Math.abs(r) >= 1e21
		? r.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 4 })
		: String(r);
}

/**
 * Serialize already-fitted {@link Segment}s to an SVG path `d` string. Use this
 * when you already hold segments (e.g. from {@link cornuSegments}) to avoid
 * re-fitting. Pass `closed` to append `Z`.
 */
export function segmentsToSVGPath(segments: Segment[], closed = false): string {
	const f = formatCoord;
	let d = '';
	for (const s of segments) {
		if (s.type === 'moveto') d += `M ${f(s.x)} ${f(s.y)} `;
		else if (s.type === 'lineto') d += `L ${f(s.x)} ${f(s.y)} `;
		else
			d += `C ${f(s.x1)} ${f(s.y1)} ${f(s.x2)} ${f(s.y2)} ${f(s.x)} ${f(s.y)} `;
	}
	if (closed) d += 'Z';
	return d.trim();
}

/**
 * Fit a Cornu spline through the points and return an SVG path `d` string.
 */
export function cornuToSVGPath(
	points: InputPoint[],
	options: CornuOptions = {},
): string {
	return segmentsToSVGPath(cornuSegments(points, options), options.closed);
}

/**
 * Apply a fitted Cornu spline to a Canvas 2D path (or any object exposing
 * moveTo / lineTo / bezierCurveTo). Does not stroke or fill — the caller
 * decides how to render.
 */
export function cornuToCanvas(
	ctx: {
		moveTo(x: number, y: number): void;
		lineTo(x: number, y: number): void;
		bezierCurveTo(
			x1: number, y1: number, x2: number, y2: number, x: number, y: number,
		): void;
		closePath?(): void;
	},
	points: InputPoint[],
	options: CornuOptions = {},
): void {
	const segs = cornuSegments(points, options);
	for (const s of segs) {
		if (s.type === 'moveto') ctx.moveTo(s.x, s.y);
		else if (s.type === 'lineto') ctx.lineTo(s.x, s.y);
		else ctx.bezierCurveTo(s.x1, s.y1, s.x2, s.y2, s.x, s.y);
	}
	if (options.closed && ctx.closePath) ctx.closePath();
}

/**
 * Fit a Cornu spline and return a `Path2D` (browser/Canvas). Handy for
 * `ctx.stroke(path)` / `ctx.fill(path)` and hit-testing. Throws if `Path2D`
 * is unavailable (e.g. Node without a canvas polyfill).
 */
export function cornuToPath2D(
	points: InputPoint[],
	options: CornuOptions = {},
): Path2D {
	if (typeof Path2D === 'undefined') {
		throw new Error('Path2D is not available in this environment');
	}
	const path = new Path2D();
	cornuToCanvas(path, points, options);
	return path;
}

/**
 * Approximate arc length of the fitted spline (sum of flattened chord
 * lengths). Useful for stroke-dash animations driven in user units.
 */
export function cornuLength(
	points: InputPoint[],
	options: CornuOptions = {},
): number {
	const segs = cornuSegments(points, options);
	let length = 0;
	let px = 0;
	let py = 0;
	// Flatten each curveto with a few samples for a stable estimate.
	const SAMPLES = 16;
	for (const s of segs) {
		if (s.type === 'moveto') {
			px = s.x;
			py = s.y;
		} else if (s.type === 'lineto') {
			length += Math.hypot(s.x - px, s.y - py);
			px = s.x;
			py = s.y;
		} else {
			const x0 = px;
			const y0 = py;
			let lx = x0;
			let ly = y0;
			for (let i = 1; i <= SAMPLES; i++) {
				const t = i / SAMPLES;
				const u = 1 - t;
				const a = u * u * u;
				const b = 3 * u * u * t;
				const c = 3 * u * t * t;
				const d = t * t * t;
				const x = a * x0 + b * s.x1 + c * s.x2 + d * s.x;
				const y = a * y0 + b * s.y1 + c * s.y2 + d * s.y;
				length += Math.hypot(x - lx, y - ly);
				lx = x;
				ly = y;
			}
			px = s.x;
			py = s.y;
		}
	}
	return length;
}
