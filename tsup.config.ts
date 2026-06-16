import { defineConfig } from 'tsup';

// Build both entries (core + react) as ESM and CJS with type declarations.
export default defineConfig({
	entry: {
		index: 'src/index.ts',
		react: 'src/react.tsx',
	},
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	sourcemap: true,
	treeshake: true,
	external: ['react'],
	outExtension({ format }) {
		return { js: format === 'cjs' ? '.cjs' : '.js' };
	},
});
