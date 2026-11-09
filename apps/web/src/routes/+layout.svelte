<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Status, User } from '@mealler/shared';
  import { get } from '$lib/api';
  import { app, setUser, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import { flushQueue, net } from '$lib/offline.svelte';
  import Splash from '$lib/Splash.svelte';

  let { children }: { children: Snippet } = $props();
  let ready = $state(false);
  let splashMessage = $state(t('splash.starting'));
  const SPLASH_MIN_MS = 700;

  const PUBLIC = ['/login', '/setup', '/register'];
  const path = $derived(page.url.pathname);
  const isPublic = $derived(PUBLIC.includes(path));

  onMount(async () => {
    const started = Date.now();
    try {
      app.status = await get<Status>('/status');
    } catch {
      app.status = null;
      if (!navigator.onLine) splashMessage = t('splash.offline');
    }

    // Version check: if the server runs a newer build than the app cached on this device,
    // refresh once so the service worker and assets are updated.
    const serverVersion = app.status?.version;
    if (serverVersion && serverVersion !== 'dev' && serverVersion !== __APP_VERSION__ && navigator.onLine) {
      const key = 'mealler-reloaded-for';
      if (sessionStorage.getItem(key) !== serverVersion) {
        sessionStorage.setItem(key, serverVersion);
        splashMessage = t('splash.updating', { v: serverVersion });
        const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
        await registration?.update().catch(() => {});
        location.reload();
        return;
      }
    }

    try {
      setUser(await get<User>('/me'));
    } catch {
      setUser(null);
    }
    const wait = SPLASH_MIN_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ready = true;
  });

  function onNetworkChange() {
    net.online = navigator.onLine;
    if (net.online) void flushQueue();
  }

  $effect(() => {
    if (!ready) return;
    if (app.status?.setupRequired) {
      if (path !== '/setup') goto('/setup', { replaceState: true });
    } else if (!app.user && !isPublic) {
      // Remember where the user was going (e.g. the claude.ai consent screen).
      const next = path === '/' ? '' : `?next=${encodeURIComponent(path + page.url.search)}`;
      goto(`/login${next}`, { replaceState: true });
    } else if (app.user && isPublic) {
      const next = page.url.searchParams.get('next');
      goto(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replaceState: true });
    }
  });

  const tabs = [
    { href: '/', key: 'nav.today', icon: 'calendar' },
    { href: '/profile', key: 'nav.profile', icon: 'user' }
  ] as const;

  // Render a page only once the user is allowed on it, so pages never fire requests before a redirect.
  const allowed = $derived(
    app.status?.setupRequired ? path === '/setup' : app.user ? !isPublic : isPublic && path !== '/setup'
  );

  const activeTab =$derived(path === '/' || path.startsWith('/add') ? '/' : '/profile');
</script>

<svelte:window ononline={onNetworkChange} onoffline={onNetworkChange} />

{#if ready && allowed}
  {@render children()}

  {#if app.user && !isPublic}
    <nav class="tabbar" aria-label={t('nav.main')}>
      {#each tabs as tab (tab.href)}
        <a href={tab.href} aria-current={activeTab === tab.href ? 'page' : undefined}>
          <span class="pill"><Icon name={tab.icon} /></span>
          {t(tab.key)}
        </a>
      {/each}
    </nav>
  {/if}
{:else}
  <Splash message={splashMessage} version={app.status?.version ?? __APP_VERSION__} />
{/if}

<style>
  .tabbar {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 8px 8px max(12px, env(safe-area-inset-bottom));
    background: var(--nav);
    border-top: 1px solid var(--border);
  }
  .tabbar a {
    flex: 1;
    max-width: 160px;
    min-height: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-2);
    text-decoration: none;
  }
  .tabbar a[aria-current='page'] {
    color: var(--accent-ink);
    font-weight: 700;
  }
  .pill {
    width: 56px;
    height: 32px;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tabbar a[aria-current='page'] .pill {
    background: var(--accent-soft);
  }
</style>
