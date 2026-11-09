// SPDX-License-Identifier: AGPL-3.0-or-later
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Single-page app: the server returns index.html for every non-API route.
    adapter: adapter({ fallback: 'index.html' })
  }
};

export default config;
