// SPDX-License-Identifier: AGPL-3.0-or-later
// Bundles the server with esbuild. Runtime npm dependencies stay external
// (they are installed in the image); the workspace package @mealler/shared is bundled in.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const rootPkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: Object.keys(pkg.dependencies ?? {}),
  define: { __APP_VERSION__: JSON.stringify(rootPkg.version) },
  banner: { js: '// Mealler server — AGPL-3.0-or-later' },
  logLevel: 'info'
});
