// SPDX-License-Identifier: AGPL-3.0-or-later
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
// - App shell cached at install, so the PWA opens without a network.
// - Read-only diary API calls are network-first with a cached fallback (offline reading).
// - Push messages become notifications; tapping one opens the right page.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const SHELL = `mealler-shell-${version}`;
const API = 'mealler-api';
const ASSETS = [...build, ...files];
const CACHED_API = [/^\/api\/me$/, /^\/api\/status$/, /^\/api\/slots$/, /^\/api\/day\/[\d-]+$/, /^\/api\/entries\/\d+$/, /^\/api\/thresholds$/];

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      await cache.addAll(ASSETS);
      await cache.add('/');
      await sw.skipWaiting();
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith('mealler-shell-') && key !== SHELL) await caches.delete(key);
      }
      await sw.clients.claim();
    })()
  );
});

async function networkFirst(request: Request, cacheName: string, fallbackUrl?: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = (await cache.match(request)) ?? (fallbackUrl ? await caches.match(fallbackUrl) : undefined);
    if (hit) return hit;
    throw error;
  }
}

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== sw.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (CACHED_API.some((re) => re.test(url.pathname))) event.respondWith(networkFirst(request, API));
    return;
  }

  if (ASSETS.includes(url.pathname)) {
    event.respondWith(caches.match(url.pathname).then((hit) => hit ?? fetch(request)));
    return;
  }

  if (request.mode === 'navigate') event.respondWith(networkFirst(request, SHELL, '/'));
});

sw.addEventListener('push', (event) => {
  let data = { title: 'Mealler', body: '', url: '/', tag: 'mealler' };
  try {
    data = { ...data, ...(event.data?.json() ?? {}) };
  } catch {
    if (event.data) data.body = event.data.text();
  }
  event.waitUntil(
    sw.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url }
    })
  );
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data?.url as string) ?? '/', sw.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) await (client as WindowClient).navigate(target);
          return;
        }
      }
      await sw.clients.openWindow(target);
    })()
  );
});
