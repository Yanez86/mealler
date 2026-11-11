<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "From the library" in the add-meal screen: find a packaged food, choose the amount, log it.
     With `onpick` (the favorite editor) the food is handed back instead of logged. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { G_PER_OZ, mealCategory, type Product, type ProductDraft } from '@mealler/shared';
  import { get, post } from './api';
  import { app, errorMessage, formatNumber, t } from './state.svelte';
  import BarcodeScanner from './BarcodeScanner.svelte';
  import FoodIcon from './FoodIcon.svelte';
  import { servingKcal, servingText } from './serving';
  import Icon from './Icon.svelte';

  let {
    slotId,
    date,
    productId = null,
    onlogged,
    onpick,
    back = null
  }: {
    slotId: number | null;
    date: string;
    productId?: number | null;
    onlogged: () => void;
    onpick?: (product: Product, grams: number) => void;
    /** Where to come back after adding a scanned food to the library (this meal by default). */
    back?: string | null;
  } = $props();

  let query = $state('');
  let results = $state<Product[]>([]);
  // The text the results on screen answer to: "nothing found" is said only once the answer is in.
  let answered = $state('');
  let selected = $state<Product | null>(null);
  let mode = $state<'grams' | 'servings'>('grams');
  // With US units the weight is typed in ounces; the library and the diary keep grams.
  const us = $derived(app.user?.units === 'us');
  const weightLabel = $derived(us ? t('foods.ounces') : t('foods.grams'));
  const weightText = (g: number | null) => (g == null ? '' : us ? formatNumber(g / G_PER_OZ, 1) : String(g));
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
        const found = await get<Product[]>(`/products?q=${encodeURIComponent(q)}`);
        // An answer to an older text must not replace a newer one.
        if (q !== query.trim()) return;
        results = found;
        answered = q;
      } catch (e) {
        error = errorMessage(e);
      }
    }, 250);
  });

  // Back from adding a scanned food to the library: it is ready to be logged.
  onMount(async () => {
    if (productId) choose(await get<Product>(`/products/${productId}`).catch(() => null));
  });

  let section = $state<HTMLElement | null>(null);

  /** Opens a food from outside (a starred food tapped in the meal form), ready for its amount. */
  export function chooseProduct(p: Product) {
    choose(p);
    requestAnimationFrame(() => section?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }

  function choose(p: Product | null) {
    if (!p) return;
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
      // Not in the library yet: add it there, then come back to this meal (what was typed is kept as a draft).
      else await goto(`/favorites?tab=library&barcode=${code}&back=${encodeURIComponent(back ?? `/add?slot=${slotId ?? ''}&d=${date}`)}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const grams = $derived.by(() => {
    const n = Number(amount.replace(',', '.'));
    if (!selected || !Number.isFinite(n) || n <= 0) return null;
    if (mode === 'servings' && selected.servingG) return n * selected.servingG;
    return us ? Math.round(n * G_PER_OZ * 10) / 10 : n;
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
    if (selected && grams != null && onpick) {
      onpick(selected, grams);
      selected = null;
      return;
    }
    if (!selected || grams == null || !slotId) return;
    busy = true;
    error = '';
    try {
      await post(`/products/${selected.id}/log`, { slotId, date, grams });
      selected = null;
      onlogged();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<section class="field" aria-labelledby="lib-title" bind:this={section}>
  <h2 id="lib-title" class="label">{t('foods.fromLibrary')}</h2>

  {#if scanning}
    <BarcodeScanner oncode={onCode} onclose={() => (scanning = false)} />
  {:else if selected}
    <div class="card stack picked">
      <div class="picked-head">
        <FoodIcon category={selected.category ?? mealCategory([selected.name])} size={44} />
        <div class="grow">
          <p class="name">{selected.name}</p>
          {#if selected.brand}<p class="muted small">{selected.brand}</p>{/if}
        </div>
        <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={() => (selected = null)}><Icon name="close" /></button>
      </div>
      {#if selected.servingG}
        <div class="chips" role="group" aria-label={t('foods.amount')}>
          <button class="chip" type="button" aria-pressed={mode === 'servings'} onclick={() => { mode = 'servings'; amount = '1'; }}>
            {t('foods.servings')} · {servingText(selected)}
          </button>
          <button class="chip" type="button" aria-pressed={mode === 'grams'} onclick={() => { mode = 'grams'; amount = weightText(selected?.servingG ?? null); }}>{weightLabel}</button>
        </div>
      {/if}
      <div class="field">
        <label for="lib-amount">{mode === 'servings' ? t('foods.servings') : weightLabel}</label>
        <input id="lib-amount" inputmode="decimal" autocomplete="off" bind:value={amount} />
      </div>
      {#if preview}<p class="muted">{preview}</p>{/if}
      <button class="btn btn-primary btn-block" type="button" disabled={busy || grams == null || (!slotId && !onpick)} onclick={log}>{onpick ? t('foods.addToMeal') : t('foods.add')}</button>
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
              <FoodIcon category={p.category ?? mealCategory([p.name])} size={32} />
              <span class="grow">
                <span class="name">{p.name}</span>
                {#if p.brand}<span class="muted small"> · {p.brand}</span>{/if}
              </span>
              <span class="muted small per">
                {#if servingKcal(p) != null}{`${formatNumber(servingKcal(p) ?? 0)} kcal · ${servingText(p)}`}<br />{/if}{t('foods.per100short', { kcal: formatNumber(p.kcal) })}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {:else if query.trim() && answered === query.trim()}
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
    gap: 10px;
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
  .per {
    flex: none;
    max-width: 45%;
    text-align: right;
  }
  .name {
    font-weight: 600;
  }
  .picked-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
