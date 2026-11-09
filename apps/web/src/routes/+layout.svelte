<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Status, User } from '@mealler/shared';
  import { get, patch } from '$lib/api';
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
    { href: '/trends', key: 'nav.trends', icon: 'chart' },
    { href: '/favorites', key: 'nav.favorites', icon: 'star' },
    { href: '/profile', key: 'nav.profile', icon: 'user' }
  ] as const;

  // After an update, invite the user to read what changed (once per version).
  const showNews = $derived(
    !!app.user &&
      !!app.status &&
      app.status.version !== 'dev' &&
      app.user.lastSeenVersion !== app.status.version &&
      path !== '/news' &&
      !isPublic
  );

  // Closing the banner counts as having seen the news: hide it at once, then tell the server.
  function dismissNews() {
    const version = app.status?.version;
    if (!app.user || !version) return;
    app.user.lastSeenVersion = version;
    void patch<User>('/me', { lastSeenVersion: version }).catch(() => {});
  }

  // Render a page only once the user is allowed on it, so pages never fire requests before a redirect.
  const allowed = $derived(
    app.status?.setupRequired ? path === '/setup' : app.user ? !isPublic : isPublic && path !== '/setup'
  );

  const activeTab = $derived(
    path === '/' || path.startsWith('/add')
      ? '/'
      : path.startsWith('/trends')
        ? '/trends'
        : path.startsWith('/favorites')
          ? '/favorites'
          : '/profile'
  );
</script>

<svelte:window ononline={onNetworkChange} onoffline={onNetworkChange} />

{#if ready && allowed}
  {#if showNews}
    <div class="news">
      <a href="/news"><Icon name="gift" size={20} /><span>{t('news.banner', { v: app.status?.version ?? '' })} <strong>{t('news.see')}</strong></span></a>
      <button type="button" aria-label={t('common.close')} onclick={dismissNews}><Icon name="close" size={20} /></button>
    </div>
  {/if}
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
  .news {
    display: flex;
    align-items: center;
    width: calc(100% - 32px);
    max-width: 528px;
    /* The banner is the first thing on screen: keep it clear of the status bar like the header. */
    margin: max(8px, var(--status-clear)) auto 0;
    border-radius: 14px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-size: 15px;
  }
  .news a {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0 10px 16px;
    color: inherit;
    text-decoration: none;
  }
  .news button {
    flex: none;
    width: 48px;
    height: 48px;
    padding: 0;
    border: none;
    border-radius: 14px;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  /* The banner already sits below the status bar, so the header under it needs no extra room. */
  .news + :global(main) > :global(.topbar) {
    padding-top: 16px;
  }
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
    max-width: 120px;
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
