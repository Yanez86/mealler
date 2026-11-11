<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import '../app.css';
  import { onMount, type Snippet } from 'svelte';
  import { goto, onNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import type { Status, User } from '@mealler/shared';
  import { ApiError, get, patch } from '$lib/api';
  import { app, clock, setUser, t } from '$lib/state.svelte';
  import { releasesSince } from '$lib/changelog';
  import Icon from '$lib/Icon.svelte';
  import NewsPopup from '$lib/NewsPopup.svelte';
  import AchievementToast from '$lib/AchievementToast.svelte';
  import { flushQueue, net } from '$lib/offline.svelte';
  import Splash from '$lib/Splash.svelte';

  let { children }: { children: Snippet } = $props();
  let ready = $state(false);
  let splashMessage = $state(t('splash.starting'));
  const SPLASH_MIN_MS = 700;

  const PUBLIC = ['/login', '/setup', '/register', '/reset'];
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

    // Only "not signed in" leads to the login page: a server that is down or restarting is waited for.
    for (;;) {
      try {
        app.status ??= await get<Status>('/status');
        setUser(await get<User>('/me'));
        break;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          setUser(null);
          break;
        }
        splashMessage = t(navigator.onLine ? 'splash.unreachable' : 'splash.offline');
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    const wait = SPLASH_MIN_MS - (Date.now() - started);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    ready = true;
  });

  function onNetworkChange() {
    net.online = navigator.onLine;
    if (net.online) void flushQueue();
  }

  // Entries waiting on the device are sent again when the app comes back to the foreground and once a
  // minute, not only when the network returns: the server may have been the one that was away.
  $effect(() => {
    void clock.now;
    if (ready && app.user && net.online && net.pending > 0) void flushQueue();
  });

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

  // ---------- Page transitions ----------
  // A short slide between pages (View Transitions API, where the browser has it): deeper pages come in
  // from the right and leave to the right; between tabs the page slides towards the tab's side.
  // The tab bar stays still and its highlight moves to the new tab (see app.css).
  const TAB_ORDER = ['/', '/trends', '/favorites', '/profile'];
  onNavigate((navigation) => {
    const from = navigation.from?.url.pathname;
    const to = navigation.to?.url.pathname;
    // Same page (another day of the diary): the page animates its own content.
    if (!from || !to || from === to || !document.startViewTransition) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const a = TAB_ORDER.indexOf(from);
    const b = TAB_ORDER.indexOf(to);
    const kind = a >= 0 && b >= 0 ? (b > a ? 'next' : 'prev') : a < 0 && b >= 0 ? 'back' : 'forward';
    const root = document.documentElement;
    root.dataset.nav = kind;
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
      transition.finished.finally(() => delete root.dataset.nav);
    });
  });

  // After an update, show what changed in a popup (once per version).
  const showNews = $derived(
    !!app.user &&
      !!app.status &&
      app.status.version !== 'dev' &&
      app.user.lastSeenVersion !== app.status.version &&
      path !== '/news' &&
      !isPublic
  );

  // Closing the popup counts as having seen the news: hide it at once, then tell the server.
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
  {@render children()}

  {#if app.user && !isPublic}
    <AchievementToast {path} />
    <nav class="tabbar" aria-label={t('nav.main')}>
      {#each tabs as tab (tab.href)}
        <a href={tab.href} aria-current={activeTab === tab.href ? 'page' : undefined}>
          <span class="pill"><Icon name={tab.icon} /></span>
          {t(tab.key)}
        </a>
      {/each}
    </nav>
  {/if}
  {#if showNews && app.status}
    <NewsPopup version={app.status.version} releases={releasesSince(app.user?.lastSeenVersion, app.status.version)} onclose={dismissNews} />
  {/if}
{:else}
  <Splash message={splashMessage} version={app.status?.version ?? __APP_VERSION__} />
{/if}

<style>
  /* Always above the page, whatever the page stacks inside it. */
  .tabbar {
    z-index: 20;
    /* Kept out of the page transition: it stays still while the page slides. */
    view-transition-name: tabbar;
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
    /* The highlight glides from the old tab to the new one. */
    view-transition-name: tab-pill;
  }
</style>
