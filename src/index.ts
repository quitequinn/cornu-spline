// index.ts — main entry. Re-exports the framework-agnostic core API.
export type {
	InputPoint,
	PointTuple,
	PointObject,
	CornuOptions,
	Segment,
} from './core';
export {
	cornuSegments,
	cornuToSVGPath,
	segmentsToSVGPath,
	cornuToCanvas,
	cornuToPath2D,
	cornuLength,
} from './core';
