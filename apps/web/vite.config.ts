// SPDX-License-Identifier: AGPL-3.0-or-later
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [sveltekit()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    proxy: { '/api': 'http://localhost:3000' }
  }
});
