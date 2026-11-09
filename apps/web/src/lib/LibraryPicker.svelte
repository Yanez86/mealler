<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "From the library" in the add-meal screen: find a packaged food, choose the amount, log it. -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { Product, ProductDraft } from '@mealler/shared';
  import { get, post } from './api';
  import { errorMessage, formatNumber, t } from './state.svelte';
  import BarcodeScanner from './BarcodeScanner.svelte';
  import Icon from './Icon.svelte';

  let { slotId, date, onlogged }: { slotId: number | null; date: string; onlogged: () => void } = $props();

  let query = $state('');
  let results = $state<Product[]>([]);
  let selected = $state<Product | null>(null);
  let mode = $state<'grams' | 'servings'>('grams');
  let amount = $state('');
  let scanning = $state(false);
  let error = $state('');
  let busy = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    const q = query.trim();
    clearTimeout(timer);
    if (!q) {
      results = [];
      return;
    }
    timer = setTimeout(async () => {
      try {
        results = await get<Product[]>(`/products?q=${encodeURIComponent(q)}`);
      } catch (e) {
        error = errorMessage(e);
      }
    }, 250);
  });

  function choose(p: Product) {
    selected = p;
    query = '';
    results = [];
    mode = p.servingG ? 'servings' : 'grams';
    amount = p.servingG ? '1' : '';
  }

  async function onCode(code: string) {
    scanning = false;
    error = '';
    try {
      const res = await get<{ product: Product | null; draft: ProductDraft | null }>(`/products/barcode/${code}`);
      if (res.product) choose(res.product);
      else await goto(`/favorites?tab=foods&barcode=${code}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const grams = $derived.by(() => {
    const n = Number(amount.replace(',', '.'));
    if (!selected || !Number.isFinite(n) || n <= 0) return null;
    return mode === 'servings' && selected.servingG ? n * selected.servingG : n;
  });
  const preview = $derived.by(() => {
    if (!selected || grams == null) return null;
    const f = grams / 100;
    return t('foods.preview', {
      kcal: formatNumber(selected.kcal * f),
      p: formatNumber(selected.protein * f, 1),
      c: formatNumber(selected.carbs * f, 1),
      f: formatNumber(selected.fat * f, 1)
    });
  });

  async function log() {
    if (!selected || grams == null || !slotId) return;
    busy = true;
    error = '';
    try {
      await post(`/products/${selected.id}/log`, { slotId, date, grams });
      onlogged();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="field" aria-labelledby="lib-title">
  <h2 id="lib-title" class="label">{t('foods.fromLibrary')}</h2>

  {#if scanning}
    <BarcodeScanner oncode={onCode} onclose={() => (scanning = false)} />
  {:else if selected}
    <div class="card stack picked">
      <div class="picked-head">
        <div class="grow">
          <p class="name">{selected.name}</p>
          {#if selected.brand}<p class="muted small">{selected.brand}</p>{/if}
        </div>
        <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={() => (selected = null)}><Icon name="close" /></button>
      </div>
      {#if selected.servingG}
        <div class="chips" role="group" aria-label={t('foods.amount')}>
          <button class="chip" type="button" aria-pressed={mode === 'servings'} onclick={() => { mode = 'servings'; amount = '1'; }}>
            {t('foods.servings')}{#if selected.servingLabel} · {selected.servingLabel}{/if}
          </button>
          <button class="chip" type="button" aria-pressed={mode === 'grams'} onclick={() => { mode = 'grams'; amount = String(selected?.servingG ?? ''); }}>{t('foods.grams')}</button>
        </div>
      {/if}
      <div class="field">
        <label for="lib-amount">{mode === 'servings' ? t('foods.servings') : t('foods.grams')}</label>
        <input id="lib-amount" inputmode="decimal" autocomplete="off" bind:value={amount} />
      </div>
      {#if preview}<p class="muted">{preview}</p>{/if}
      <button class="btn btn-primary btn-block" type="button" disabled={busy || grams == null || !slotId} onclick={log}>{t('foods.add')}</button>
    </div>
  {:else}
    <div class="search">
      <label class="visually-hidden" for="lib-q">{t('foods.search')}</label>
      <input id="lib-q" class="input" type="search" autocomplete="off" placeholder={t('foods.searchHint')} bind:value={query} />
      <button class="icon-btn" type="button" aria-label={t('foods.scan')} onclick={() => (scanning = true)}><Icon name="barcode" /></button>
    </div>
    {#if results.length}
      <ul class="card results">
        {#each results as p (p.id)}
          <li>
            <button type="button" onclick={() => choose(p)}>
              <span class="grow">
                <span class="name">{p.name}</span>
                {#if p.brand}<span class="muted small"> · {p.brand}</span>{/if}
              </span>
              <span class="muted small">{t('foods.per100short', { kcal: formatNumber(p.kcal) })}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if query.trim()}
      <p class="muted small">{t('foods.none')}</p>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</section>

<style>
  .search {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .search input {
    flex: 1;
    min-width: 0;
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 4px 8px;
  }
  .results button {
    width: 100%;
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .picked-head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
</style>
