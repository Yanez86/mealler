// SPDX-License-Identifier: AGPL-3.0-or-later
// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
  /** Version of the web app, from the root package.json (set by Vite). */
  const __APP_VERSION__: string;
}

export {};
