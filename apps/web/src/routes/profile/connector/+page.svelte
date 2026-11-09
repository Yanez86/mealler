<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { del, get } from '$lib/api';
  import { errorMessage, formatDate, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  interface Connection {
    clientId: string;
    name: string;
    createdAt: string;
    lastUsedAt: string | null;
  }

  let connector = $state<{ enabled: boolean; url: string } | null>(null);
  let connections = $state<Connection[]>([]);
  let copied = $state(false);
  let error = $state('');

  onMount(load);

  async function load() {
    try {
      [connector, connections] = await Promise.all([
        get<{ enabled: boolean; url: string }>('/connector'),
        get<Connection[]>('/oauth/connections')
      ]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function copy() {
    if (!connector) return;
    try {
      await navigator.clipboard.writeText(connector.url);
      copied = true;
      setTimeout(() => (copied = false), 2500);
    } catch {
      prompt(t('connector.copy'), connector.url);
    }
  }

  async function revoke(c: Connection) {
    try {
      await del(`/oauth/connections/${encodeURIComponent(c.clientId)}`);
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const day = (iso: string) => formatDate(iso.slice(0, 10), { day: 'numeric', month: 'long' });
</script>

<svelte:head><title>{t('connector.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('connector.title')}>
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if connector && !connector.enabled}
    <p class="notice">{t('connector.disabled')}</p>
  {:else if connector}
    <p class="muted">{t('connector.intro')}</p>
    <ol class="card steps">
      <li>{t('connector.step1')}</li>
      <li>
        {t('connector.step2')}
        <code class="url">{connector.url}</code>
        <button class="btn btn-primary" type="button" onclick={copy}>{copied ? t('connector.copied') : t('connector.copy')}</button>
      </li>
      <li>{t('connector.step3')}</li>
    </ol>
    <p class="help">{t('connector.privacy')}</p>
    <p class="help">{t('connector.free')}</p>
  {/if}

  <section class="card" aria-labelledby="conn-title">
    <h2 id="conn-title" class="section-title">{t('connector.connections')}</h2>
    {#if connections.length}
      <ul class="plain">
        {#each connections as c (c.clientId)}
          <li class="list-row">
            <div class="grow">
              <p><strong>{c.name}</strong></p>
              <p class="muted small">{c.lastUsedAt ? t('connector.lastUsed', { d: day(c.lastUsedAt) }) : t('connector.never')}</p>
            </div>
            <button class="btn btn-ghost" type="button" onclick={() => revoke(c)}>{t('connector.revoke')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted" style="margin-top: 8px">{t('connector.none')}</p>
    {/if}
  </section>
</main>

<style>
  .steps {
    margin: 0;
    padding-left: 40px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .steps li > :global(*) {
    margin-top: 8px;
  }
  .url {
    display: block;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
</style>
