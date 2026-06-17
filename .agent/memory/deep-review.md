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
