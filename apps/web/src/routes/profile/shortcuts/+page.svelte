<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- iPhone shortcuts: personal keys (shown once, revocable) and the steps to build "Glass of water",
     which adds a glass from the lock screen, Control Center, the Action button or Siri. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { ShortcutKey } from '@mealler/shared';
  import { del, get, post } from '$lib/api';
  import { errorMessage, formatDate, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let keys = $state<ShortcutKey[]>([]);
  let name = $state('iPhone');
  // The key just made: shown once, here, then never again.
  let fresh = $state<string | null>(null);
  let copied = $state<string | null>(null);
  let busy = $state(false);
  let error = $state('');

  const url = typeof location === 'undefined' ? '/api/shortcut/water' : `${location.origin}/api/shortcut/water`;
  const https = typeof location === 'undefined' || location.protocol === 'https:';

  onMount(load);

  async function load() {
    try {
      keys = await get<ShortcutKey[]>('/shortcut-keys');
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    busy = true;
    error = '';
    try {
      const made = await post<ShortcutKey & { token: string }>('/shortcut-keys', { name: name.trim() });
      fresh = made.token;
      await load();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function revoke(k: ShortcutKey) {
    if (!confirm(t('shortcuts.revokeConfirm', { name: k.name }))) return;
    try {
      await del(`/shortcut-keys/${k.id}`);
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function copy(what: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = what;
      setTimeout(() => (copied = null), 2500);
    } catch {
      prompt(t('shortcuts.copy'), text);
    }
  }

  const day = (iso: string) => formatDate(iso.slice(0, 10), { day: 'numeric', month: 'long' });
</script>

<svelte:head><title>{t('shortcuts.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('shortcuts.title')} section="profile">
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <p class="muted">{t('shortcuts.intro')}</p>
  {#if !https}<p class="notice">{t('shortcuts.notHttps')}</p>{/if}

  <section class="card stack" aria-labelledby="keys-title">
    <h2 id="keys-title" class="section-title">{t('shortcuts.keys')}</h2>
    {#if fresh}
      <div class="fresh stack" role="status">
        <p><strong>{t('shortcuts.freshTitle')}</strong></p>
        <code class="code">{fresh}</code>
        <button class="btn btn-primary" type="button" onclick={() => copy('key', fresh ?? '')}>
          {copied === 'key' ? t('shortcuts.copied') : t('shortcuts.copyKey')}
        </button>
        <p class="help">{t('shortcuts.freshHelp')}</p>
      </div>
    {/if}
    {#if keys.length}
      <ul class="plain">
        {#each keys as k (k.id)}
          <li class="list-row">
            <div class="grow">
              <p><strong>{k.name}</strong></p>
              <p class="muted small">{k.lastUsedAt ? t('shortcuts.lastUsed', { d: day(k.lastUsedAt) }) : t('shortcuts.never')}</p>
            </div>
            <button class="btn btn-ghost" type="button" onclick={() => revoke(k)}>{t('shortcuts.revoke')}</button>
          </li>
        {/each}
      </ul>
    {:else if !fresh}
      <p class="muted">{t('shortcuts.none')}</p>
    {/if}
    <form class="new-key" onsubmit={create}>
      <div class="field grow">
        <label for="key-name">{t('shortcuts.keyName')}</label>
        <input id="key-name" required maxlength="60" bind:value={name} />
      </div>
      <button class="btn" type="submit" disabled={busy || !name.trim()}><Icon name="plus" size={20} />{t('shortcuts.create')}</button>
    </form>
  </section>

  <section class="card stack" aria-labelledby="steps-title">
    <h2 id="steps-title" class="section-title">{t('shortcuts.how')}</h2>
    <ol class="steps">
      <li>{t('shortcuts.step1')}</li>
      <li>{t('shortcuts.step2')}</li>
      <li>
        {t('shortcuts.step3')}
        <code class="code">{url}</code>
        <button class="btn" type="button" onclick={() => copy('url', url)}>{copied === 'url' ? t('shortcuts.copied') : t('shortcuts.copyUrl')}</button>
      </li>
      <li>
        {t('shortcuts.step4')}
        <code class="code">Authorization: Bearer {fresh ?? 'mlr_…'}</code>
        {#if fresh}
          <button class="btn" type="button" onclick={() => copy('header', `Bearer ${fresh}`)}>
            {copied === 'header' ? t('shortcuts.copied') : t('shortcuts.copyHeader')}
          </button>
        {/if}
      </li>
      <li>{t('shortcuts.step5')}</li>
      <li>{t('shortcuts.step6')}</li>
    </ol>
  </section>

  <section class="card stack" aria-labelledby="where-title">
    <h2 id="where-title" class="section-title">{t('shortcuts.where')}</h2>
    <ul class="where">
      <li><strong>{t('shortcuts.whereLock')}</strong> {t('shortcuts.whereLockHow')}</li>
      <li><strong>{t('shortcuts.whereControl')}</strong> {t('shortcuts.whereControlHow')}</li>
      <li><strong>{t('shortcuts.whereAction')}</strong> {t('shortcuts.whereActionHow')}</li>
      <li><strong>{t('shortcuts.whereSiri')}</strong> {t('shortcuts.whereSiriHow')}</li>
      <li><strong>{t('shortcuts.whereHome')}</strong> {t('shortcuts.whereHomeHow')}</li>
    </ul>
  </section>

  <p class="help">{t('shortcuts.privacy')}</p>
  <p class="help">{t('shortcuts.amount')}</p>
</main>

<style>
  .steps {
    margin: 0;
    padding-left: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .steps li > :global(*) {
    margin-top: 8px;
  }
  .where {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .code {
    display: block;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--surface-2);
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  .fresh {
    padding: 14px;
    border-radius: 14px;
    background: var(--accent-soft);
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
  .new-key {
    display: flex;
    align-items: flex-end;
    gap: 12px;
  }
</style>
