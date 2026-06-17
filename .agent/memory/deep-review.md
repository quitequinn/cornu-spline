# Panel Review — Project Specialists

Saved: 2026-06-17

## Specialists
1. Glyph / Typography Engineer — detected: opentype.js, glyph path commands, bezier sampling in src/text.ts
2. Font Engineer — detected: .ttf parsing, getPath/getAdvanceWidth, variable-font handling
3. Animation Engineer — detected: requestAnimationFrame (useWobble), CSS keyframes draw-on in src/react.tsx
4. Graphics / Rendering Engineer — detected: SVG path emission, Canvas/Path2D, Fresnel-integral curve math in src/core.ts

## Known intentional patterns
<!-- Populated automatically after each review session -->
- Fresnel coefficient arrays are a faithful port of cephes/NodeBox; numeric constants are intentional.
- `cornuToPath2D` throws when `Path2D` is undefined (Node) — intentional, documented.
- Core entry has no runtime deps; opentype.js is only used by `cornu-spline/text`.

### Session 2026-06-17 (issues #3–#19, all resolved in v0.5.0)
- Bezier emitter uses a fixed 5 cubics / flat 100 samples per segment — deliberate fidelity/size tradeoff; do not flag.
- `singleStroke` deliberately joins contours/words into one ribbon (the original NodeBox aesthetic) — not a bug.
- `segmentBounds` is a conservative convex-hull box (control points, ignores stroke width) — intended; size viewBox from it plus your own stroke padding.
- Word-wrap/align measure font advance (`getAdvanceWidth`), not the reinterpreted ribbon width — inherent to the effect; documented.
- `@types/opentype.js` is DefinitelyTyped 1.3.x (no v2 typings exist) but covers the v2 runtime API used — acknowledged, not fixable upstream.
- opentype ESM/CJS interop via `ot = opentype.default ?? opentype`, with lazy `requireParse()` — intentional.
- `useWobble` (the exported hook) re-renders per frame by design (returns animated points); `<CornuPath wobble>` is the imperative, no-re-render path. Don't re-flag the hook.
