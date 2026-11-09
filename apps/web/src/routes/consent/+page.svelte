<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- OAuth consent screen: claude.ai (or another MCP client) asks to access the diary. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { get, post } from '$lib/api';
  import { app, errorMessage, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const query = page.url.searchParams;
  const params = Object.fromEntries(query.entries());
  let info = $state<{ clientName: string; redirectHost: string } | null>(null);
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    try {
      info = await get(`/oauth/request?${query.toString()}`);
    } catch (e) {
      error = errorMessage(e);
    }
  });

  async function decide(approve: boolean) {
    busy = true;
    error = '';
    try {
      const { redirect } = await post<{ redirect: string }>('/oauth/decision', { approve, params });
      location.assign(redirect);
    } catch (e) {
      error = errorMessage(e);
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('consent.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('consent.title')} />
  {#if info}
    <section class="card stack">
      <p class="lead">{t('consent.intro', { client: info.clientName, user: app.user?.email ?? '' })}</p>
      <div>
        <p class="label">{t('consent.can')}</p>
        <ul>
          <li><Icon name="check" size={18} stroke={2.5} />{t('consent.read')}</li>
          <li><Icon name="check" size={18} stroke={2.5} />{t('consent.write')}</li>
        </ul>
      </div>
      <p class="help">{t('consent.privacy')}</p>
      <p class="help">{t('consent.redirect', { host: info.redirectHost })}</p>
    </section>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-block" type="button" disabled={busy} onclick={() => decide(true)}>{t('consent.approve')}</button>
    <button class="btn btn-block" type="button" disabled={busy} onclick={() => decide(false)}>{t('consent.deny')}</button>
  {:else if error}
    <p class="notice" role="alert">{error}</p>
  {:else}
    <p class="muted" role="status">{t('common.loading')}</p>
  {/if}
</main>

<style>
  .lead {
    font-size: 17px;
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    color: var(--text);
  }
  li :global(svg) {
    flex: none;
    margin-top: 2px;
    color: var(--ok-ink);
  }
</style>
