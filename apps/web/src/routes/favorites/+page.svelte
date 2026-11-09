<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Favorites (personal saved meals) and Foods (shared library of packaged products). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { mealCategory, type Favorite, type Product, type ProductDraft } from '@mealler/shared';
  import { del, get } from '$lib/api';
  import { errorMessage, formatNumber, t } from '$lib/state.svelte';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import ProductForm from '$lib/ProductForm.svelte';
  import { servingKcal, servingText } from '$lib/serving';
  import TopBar from '$lib/TopBar.svelte';

  const tab = $derived(page.url.searchParams.get('tab') === 'foods' ? 'foods' : 'favorites');

  // ---------- Favorites ----------
  let favorites = $state<Favorite[] | null>(null);
  let error = $state('');

  async function loadFavorites() {
    try {
      favorites = await get<Favorite[]>('/favorites');
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function removeFavorite(f: Favorite) {
    try {
      await del(`/favorites/${f.id}`);
      await loadFavorites();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  // ---------- Foods ----------
  let query = $state('');
  let foods = $state<Product[] | null>(null);
  let editing = $state<Product | null>(null);
  let draft = $state<ProductDraft | null>(null);
  let creating = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function loadFoods() {
    try {
      foods = await get<Product[]>(`/products?q=${encodeURIComponent(query.trim())}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  $effect(() => {
    if (tab !== 'foods') return;
    void query;
    clearTimeout(timer);
    timer = setTimeout(loadFoods, 250);
  });

  onMount(async () => {
    await loadFavorites();
    // Coming from a barcode that is not in the library yet: open the form prefilled.
    const code = page.url.searchParams.get('barcode');
    if (code) {
      try {
        const res = await get<{ product: Product | null; draft: ProductDraft | null }>(`/products/barcode/${code}`);
        if (res.product) editing = res.product;
        else {
          draft = res.draft ?? { name: '', brand: null, barcode: code, kcal: null, protein: null, carbs: null, fat: null, fiber: null, servingG: null, servingLabel: null, source: 'manual' };
          creating = true;
        }
      } catch (e) {
        error = errorMessage(e);
      }
    }
  });

  function closeForm() {
    editing = null;
    draft = null;
    creating = false;
  }

  async function saved() {
    closeForm();
    await loadFoods();
  }

  function setTab(next: 'favorites' | 'foods') {
    closeForm();
    goto(next === 'foods' ? '/favorites?tab=foods' : '/favorites', { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>{tab === 'foods' ? t('foods.tab') : t('fav.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('fav.title')} />

  <div class="segmented" role="group" aria-label={t('fav.title')}>
    <button type="button" aria-pressed={tab === 'favorites'} onclick={() => setTab('favorites')}>{t('fav.title')}</button>
    <button type="button" aria-pressed={tab === 'foods'} onclick={() => setTab('foods')}>{t('foods.tab')}</button>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if tab === 'favorites'}
    <p class="muted">{t('fav.intro')}</p>
    {#if favorites && !favorites.length}
      <p class="notice">{t('fav.none')}</p>
    {:else if favorites}
      <ul class="card list">
        {#each favorites as f (f.id)}
          <li class="list-row">
            <FoodIcon category={f.category ?? mealCategory([f.name, f.description], f.items)} size={44} />
            <div class="grow">
              <p class="name">{f.name}</p>
              {#if f.name !== f.description}<p class="muted small">{f.description}</p>{/if}
              <p class="muted small">
                {#if f.kcal != null}{formatNumber(f.kcal)} kcal · {/if}{t('fav.uses', { n: f.uses })}
              </p>
            </div>
            <button class="btn btn-ghost" type="button" onclick={() => removeFavorite(f)}>{t('fav.remove')}</button>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if creating || editing}
    <ProductForm product={editing} {draft} onsaved={saved} oncancel={closeForm} />
  {:else}
    <p class="muted">{t('foods.intro')}</p>
    <button class="btn btn-primary" type="button" onclick={() => (creating = true)}><Icon name="plus" size={20} />{t('foods.new')}</button>
    <div class="field">
      <label class="visually-hidden" for="foods-q">{t('foods.search')}</label>
      <input id="foods-q" class="input" type="search" autocomplete="off" placeholder={t('foods.searchHint')} bind:value={query} />
    </div>
    {#if foods && !foods.length}
      <p class="notice">{query.trim() ? t('foods.none') : t('foods.empty')}</p>
    {:else if foods}
      <ul class="card list">
        {#each foods as p (p.id)}
          {@const serving = servingText(p)}
          {@const perServing = servingKcal(p)}
          <li>
            <button class="list-row item" type="button" onclick={() => (editing = p)}>
              <FoodIcon category={p.category ?? mealCategory([p.name])} size={44} />
              <span class="grow">
                <span class="name">{p.name}</span>
                {#if p.brand}<span class="muted small"> · {p.brand}</span>{/if}
                {#if serving}
                  <span class="small block">{perServing != null ? `${serving} · ${formatNumber(perServing)} kcal` : serving}</span>
                {/if}
                <span class="muted small block">{t('foods.per100short', { kcal: formatNumber(p.kcal) })}</span>
              </span>
              <Icon name="chevron" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</main>

<style>
  .segmented {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 26px;
    background: var(--surface-2);
  }
  .segmented button {
    flex: 1;
    min-height: 44px;
    border: none;
    border-radius: 22px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .segmented button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    font-weight: 700;
  }
  .list {
    list-style: none;
    margin: 0;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
  .block {
    display: block;
  }
  .item {
    width: 100%;
    border-left: none;
    border-right: none;
    border-bottom: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  li:first-child .item {
    border-top: none;
  }
</style>
