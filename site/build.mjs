// SPDX-License-Identifier: AGPL-3.0-or-later
// Builds the presentation site into site/dist: the pages in this folder plus the app's own
// logo and food icons from apps/web/static, so the site always uses the same graphics as the app.
// Usage: node site/build.mjs
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appStatic = join(here, '..', 'apps', 'web', 'static');
const out = join(here, 'dist');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

for (const name of ['index.html', 'style.css', 'screenshots']) {
  cpSync(join(here, name), join(out, name), { recursive: true });
}
for (const name of ['logo.svg', 'apple-touch-icon.png', 'food']) {
  cpSync(join(appStatic, name), join(out, 'assets', name), { recursive: true });
}

console.log(`Site written to ${out}`);
