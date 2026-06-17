# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## 0.5.0

Hardening pass from a multi-engineer panel review (17 findings, all addressed).

### Added
- `segmentsToSVGPath(segments, closed?)` — serialize fitted segments without
  re-fitting (shared by core/text/react).
- `usePrefersReducedMotion()` hook; draw-on and wobble now respect reduced motion.
- `<CornuText>` is accessible by default (`role="img"`, `aria-label`, `<title>`)
  and gains `x` / `y` / `flat` / `fontOptions` props.

### Changed / Fixed
- `<CornuPath wobble>` animates imperatively — no full spline re-fit per React
  render. Draw-on re-triggers when geometry changes.
- O(n) duplicate-point dedupe (was O(n²)); guards against non-finite inputs.
- SVG number formatting never emits NaN/Infinity/exponential tokens.
- `renderParagraph` computes layout once; `<CornuText>` reuses its path.
- opentype `parse()` resolved lazily with a clear error; published source maps
  resolve (ship `src`); README corrections; baseline JSDoc fixed.
- Tests: 32 → 48 (interior interpolation, paragraph/align/closed/2-point/
  duplicate/length/finite, accessibility, NaN-dedupe regression).

## 0.4.1

### Docs
- README visuals for the core concept (points → curve), the two text modes
  (outline vs single-stroke), multi-line paragraphs, and the wobble animation —
  all rendered exactly (via `@resvg/resvg-js`) and contained in a framed box.
- Hero GIF rebuilt to be fully contained (no edge clipping). Reproducible via
  `npm run visuals`.

## 0.4.0

### Tooling
- React test coverage (jsdom + Testing Library) for `<CornuPath>`, `<CornuText>`,
  and `useWobble`.
- Reproducible `npm run gif` pipeline (frames → raster → GIF) with tool
  detection and graceful fallbacks.
- New `examples/draw-animation.html` demo (draw-on + wobble).
- GitHub release tags and repo topics.
- Live GitHub Pages demo (`docs/`) with a bundled SIL OFL font (Caveat).
- Upgraded dev toolchain (vitest 4, esbuild 0.28) — `npm audit`: 0 vulnerabilities.

### Added
- Multi-line text / paragraphs: `CornuFont.paragraphSegments` and
  `renderParagraph` split on `\n` and optionally word-wrap to `maxWidth`,
  stacking lines by `lineHeight` with `align` left/center/right. Exposed the
  `layoutLines` helper.
- React `<CornuText>` gains `maxWidth`, `lineHeight`, and `align` props for
  multi-line layout.
- `examples/paragraph.html` and a paragraph section in the live demo.

## 0.3.0

### Added
- Text `singleStroke` option (and `<CornuText singleStroke>`): runs one open
  Cornu spline through the whole string's on-curve points, ignoring contour
  boundaries — the flowing, ribbon-like reinterpretation of the original
  NodeBox `cornu` demo. The README hero GIF now shows this signature look.

## 0.2.0

### Added
- `cornu-spline/text`: turn any string in any font into a Cornu spline
  (`loadFont`, `parseFont`, `CornuFont`, `commandsToContours`,
  `commandsToCornuSegments`, `segmentBounds`), powered by opentype.js.
- React: `<CornuText>` component, `useFont` hook, draw-on animation (`draw`
  prop) and continuous `wobble` (`wobble` prop / `useWobble` hook).
- Core: `cornuToPath2D` (Canvas `Path2D`) and `cornuLength` (approximate arc
  length, for stroke-dash animations).
- Interactive `examples/text.html` demo.
- GitHub Actions CI (typecheck + test + build).

### Changed
- Dual-licensed **MIT OR Apache-2.0** with a `NOTICE` preserving attribution
  to Raph Levien (Apache-2.0 origin) and Mark Meyer.

## 0.1.0

### Added
- Initial release: `cornuSegments`, `cornuToSVGPath`, `cornuToCanvas`, and the
  React `<CornuPath>` component with `useCornuPath` / `useCornuSegments` hooks.
- TypeScript port of the NodeBox `cornu` library (Raph Levien's Cornu curves,
  Mark Meyer's Cornu-to-Bezier conversion).
