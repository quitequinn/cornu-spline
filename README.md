# cornu-spline

Smooth **Cornu spline** interpolation through a set of points — the aesthetically optimal curve that passes *through* every control point, built from Euler spirals (clothoids) and emitted as Bézier curves.

Cornu / Euler-spiral curves (a.k.a. **Spiro**) minimize curvature variation, which is why they look so clean to the eye. This is the curve family Raph Levien designed for font and illustration tools.

`cornu-spline` gives you a tiny, ergonomic API: **points in → smooth curve out**, as an SVG path string, Canvas drawing calls, or raw segments. It ships with first-class **vanilla JS** and **React** integration and has zero runtime dependencies.

```
npm install cornu-spline
```

## Why this exists

The only existing JS port, [`spiro`](https://www.npmjs.com/package/spiro), is a faithful but *low-level* port of libspiro: you build arrays of typed knots (`corner` / `g2` / `g4` / `open`) and implement a callback context with `moveTo`/`cubicTo` handlers. `cornu-spline` instead does the common thing in one call — give it `[x, y]` points, get a finished curve — with SVG/Canvas/React helpers included.

## Vanilla JS

```js
import { cornuToSVGPath, cornuSegments, cornuToCanvas } from 'cornu-spline';

const points = [
  [0, 0],
  [100, 0],
  [100, 100],
  [0, 100],
];

// 1. SVG path string
const d = cornuToSVGPath(points);
document.querySelector('path').setAttribute('d', d);

// 2. Draw straight to a canvas
const ctx = canvas.getContext('2d');
ctx.beginPath();
cornuToCanvas(ctx, points, { closed: true });
ctx.stroke();

// 3. Raw drawing instructions if you want full control
const segments = cornuSegments(points);
// [{ type: 'moveto', x, y }, { type: 'curveto', x1, y1, x2, y2, x, y }, ...]
```

Points may be tuples `[x, y]` or objects `{ x, y }`.

## React

```tsx
import { CornuPath, useCornuPath } from 'cornu-spline/react';

function Sketch() {
  const points = [
    [10, 80],
    [80, 20],
    [150, 120],
    [220, 40],
  ];

  return (
    <svg width={240} height={140}>
      <CornuPath
        points={points}
        fill="none"
        stroke="black"
        strokeWidth={2}
      />
    </svg>
  );
}

// Or get just the `d` string:
function Custom({ points }) {
  const d = useCornuPath(points, { closed: true });
  return <path d={d} fill="rgba(0,0,0,0.1)" />;
}
```

`<CornuPath />` forwards every standard SVG `<path>` prop (`stroke`, `fill`, `strokeDasharray`, event handlers, `ref`, …).

> Tip: memoize the `points` array (or keep a stable reference) so the hook only recomputes when the geometry actually changes.

## API

### `cornuSegments(points, options?) → Segment[]`
The core fitter. Returns drawing instructions:
- `{ type: 'moveto', x, y }`
- `{ type: 'lineto', x, y }` (only when `flat: true`)
- `{ type: 'curveto', x1, y1, x2, y2, x, y }`

### `cornuToSVGPath(points, options?) → string`
Returns an SVG path `d` string. Appends `Z` when `closed`.

### `cornuToCanvas(ctx, points, options?) → void`
Issues `moveTo` / `lineTo` / `bezierCurveTo` (and `closePath` when `closed`) on any Canvas-2D-like context. Does **not** stroke or fill — you decide.

### React: `cornu-spline/react`
- `<CornuPath points options... {...svgPathProps} />`
- `useCornuPath(points, options?) → string`
- `useCornuSegments(points, options?) → Segment[]`

### Options

| Option   | Type      | Default | Meaning                                                        |
| -------- | --------- | ------- | -------------------------------------------------------------- |
| `closed` | `boolean` | `false` | Treat the points as a closed loop.                             |
| `tweaks` | `number`  | `20`    | Smoothing iterations. Higher → smoother (and a bit more cost). |
| `flat`   | `boolean` | `false` | Emit a dense polyline (`lineto`) instead of Bézier curves.     |

## Credits

Port of the NodeBox `cornu` library.
- Cornu / Euler-spiral curve algorithm: **Raph Levien** — <http://www.levien.com/spiro/>
- Cornu-to-Bézier conversion: **Mark Meyer**

## License

MIT — see [LICENSE](./LICENSE).
