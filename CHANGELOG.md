# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

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
