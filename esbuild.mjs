import * as esbuild from 'esbuild';

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  // .cjs explícito: os fontes são ESM (imports com extensão .ts, import.meta nos
  // testes), mas o VS Code carrega a extensão com require().
  outfile: 'dist/extension.cjs',
  external: ['vscode'],
  logLevel: 'info',
  sourcemap: !production,
  minify: production,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
