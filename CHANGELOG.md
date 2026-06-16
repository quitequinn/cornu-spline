# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## Unreleased

_Repository/tooling only — no change to the published package._

- React test coverage (jsdom + Testing Library) for `<CornuPath>`, `<CornuText>`,
  and `useWobble`.
- Reproducible `npm run gif` pipeline (frames → raster → GIF) with tool
  detection and graceful fallbacks.
- New `examples/draw-animation.html` demo (draw-on + wobble).
- GitHub release tags and repo topics.

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
