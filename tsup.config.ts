import { defineConfig } from 'tsup';

// Build both entries (core + react) as ESM and CJS with type declarations.
export default defineConfig({
	entry: {
		index: 'src/index.ts',
		react: 'src/react.tsx',
		text: 'src/text.ts',
	},
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	external: ['react', 'opentype.js'],
	outExtension({ format }) {
		return { js: format === 'cjs' ? '.cjs' : '.js' };
	},
});
