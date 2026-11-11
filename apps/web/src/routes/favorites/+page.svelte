<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Favorites: Meals (favorites of several foods), Foods (favorites of one food, plus the library foods
     the user starred) and Library (the shared library of packaged products, where stars are set). -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { mealCategory, type Favorite, type Product, type ProductDraft } from '@mealler/shared';
  import { del, get, put } from '$lib/api';
  import { errorMessage, formatNumber, t } from '$lib/state.svelte';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import ProductForm from '$lib/ProductForm.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import { servingKcal, servingText } from '$lib/serving';
  import TopBar from '$lib/TopBar.svelte';

  type Tab = 'meals' | 'foods' | 'library';
  const tab = $derived.by((): Tab => {
    const asked = page.url.searchParams.get('tab');
    return asked === 'foods' || asked === 'library' ? asked : 'meals';
  });

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

  // A favorite of one food is a favorite food; of several, a favorite meal.
  const meals = $derived(favorites?.filter((f) => f.foods.length > 1) ?? null);
  const singles = $derived(favorites?.filter((f) => f.foods.length <= 1) ?? null);

  // ---------- Starred library foods ----------
  let starred = $state<Product[] | null>(null);

  async function loadStarred() {
    try {
      starred = await get<Product[]>('/products?starred=1');
    } catch (e) {
      error = errorMessage(e);
    }
  }

  /** The star is personal: it puts a library food among the user's favorite foods. */
  async function setStar(p: Product, on: boolean) {
    try {
      const updated = on ? await put<Product>(`/products/${p.id}/star`, {}) : await del<Product>(`/products/${p.id}/star`);
      if (foods) foods = foods.map((f) => (f.id === p.id ? { ...f, starred: updated.starred } : f));
      await loadStarred();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function removeFavorite(f: Favorite) {
    if (!confirm(t('fav.removeConfirm', { name: f.name }))) return;
    try {
      await del(`/favorites/${f.id}`);
      await loadFavorites();
    } catch (e) {
      error = errorMessage(e);
    }
  }


  // ---------- Foods ----------
  // Set when the page was opened from a meal being added (a barcode not in the library yet): where to go back.
  const back = $derived.by(() => {
    const to = page.url.searchParams.get('back');
    return to?.startsWith('/add?') ? to : null;
  });
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
    if (tab !== 'library') return;
    void query;
    clearTimeout(timer);
    timer = setTimeout(loadFoods, 250);
  });

  onMount(async () => {
    void loadStarred();
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

  // Only who added a food, or an admin, can delete it: for the others the row does not swipe.
  async function removeFood(p: Product) {
    if (!confirm(t('foods.deleteConfirm', { name: p.name }))) return;
    try {
      await del(`/products/${p.id}`);
      await loadFoods();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function closeForm() {
    editing = null;
    draft = null;
    creating = false;
  }

  async function saved(p: Product | null) {
    if (back) return goto(p ? `${back}&product=${p.id}` : back, { replaceState: true });
    closeForm();
    await loadFoods();
  }

  const cancelForm = () => (back ? goto(back, { replaceState: true }) : closeForm());

  function setTab(next: Tab) {
    closeForm();
    goto(next === 'meals' ? '/favorites' : `/favorites?tab=${next}`, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>{tab === 'library' ? t('foods.tab') : t('fav.title')} · Mealler</title></svelte:head>

{#snippet favoriteRow(f: Favorite)}
  <li class="swipe-item">
    <Swipeable label={t('fav.removeLabel', { name: f.name })} background="var(--surface)" ondelete={() => removeFavorite(f)}>
      <div class="list-row">
        <a class="use grow" href="/add?fav={f.id}" aria-label={t('fav.use', { name: f.name })}>
          <FoodIcon category={f.category ?? mealCategory([f.name, f.description], f.items)} size={44} />
          <span class="grow">
            <span class="name block">{f.name}</span>
            {#if f.name !== f.description}<span class="muted small block">{f.description}</span>{/if}
            <span class="muted small block">
              {f.kcal != null ? `${formatNumber(f.kcal)} kcal · ` : ''}{t('fav.uses', { n: f.uses })}
            </span>
          </span>
        </a>
        <a class="icon-btn plain" href="/add?favorite={f.id}" aria-label={t('fav.editLabel', { name: f.name })}>
          <Icon name="edit" size={20} />
        </a>
      </div>
    </Swipeable>
  </li>
{/snippet}

{#snippet productInfo(p: Product)}
  {@const serving = servingText(p)}
  {@const perServing = servingKcal(p)}
  <FoodIcon category={p.category ?? mealCategory([p.name])} size={44} />
  <span class="grow">
    <span class="name">{p.name}</span>
    {#if p.brand}<span class="muted small"> · {p.brand}</span>{/if}
    {#if serving}
      <span class="small block">{perServing != null ? `${serving} · ${formatNumber(perServing)} kcal` : serving}</span>
    {/if}
    <span class="muted small block">{t('foods.per100short', { kcal: formatNumber(p.kcal) })}</span>
  </span>
{/snippet}

<main class="page stack">
  <TopBar title={t('fav.title')} section="favorites" />

  <div class="segmented" role="group" aria-label={t('fav.title')}>
    <button type="button" aria-pressed={tab === 'meals'} onclick={() => setTab('meals')}>{t('fav.meals')}</button>
    <button type="button" aria-pressed={tab === 'foods'} onclick={() => setTab('foods')}>{t('fav.foods')}</button>
    <button type="button" aria-pressed={tab === 'library'} onclick={() => setTab('library')}>{t('foods.tab')}</button>
  </div>

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if tab === 'meals'}
    <p class="muted">{t('fav.intro')}</p>
    <a class="btn btn-primary" href="/add?favorite=new"><Icon name="plus" size={20} />{t('fav.new')}</a>
    {#if meals && !meals.length}
      <p class="notice">{t('fav.none')}</p>
    {:else if meals}
      <ul class="card list">
        {#each meals as f (f.id)}{@render favoriteRow(f)}{/each}
      </ul>
    {/if}
  {:else if tab === 'foods'}
    <p class="muted">{t('fav.foodsIntro')}</p>
    <a class="btn btn-primary" href="/add?favorite=new&kind=food"><Icon name="plus" size={20} />{t('fav.newFood')}</a>
    {#if singles && starred && !singles.length && !starred.length}
      <p class="notice">{t('fav.noFoods')}</p>
    {:else if singles && starred}
      <ul class="card list">
        {#each singles as f (f.id)}{@render favoriteRow(f)}{/each}
        <!-- Starred library foods: a tap opens them in the meal form to choose the amount; a swipe takes the star off. -->
        {#each starred as p (p.id)}
          <li class="swipe-item">
            <Swipeable label={t('fav.unstarLabel', { name: p.name })} background="var(--surface)" ondelete={() => setStar(p, false)}>
              <a class="list-row use" href="/add?product={p.id}" aria-label={t('fav.use', { name: p.name })}>
                {@render productInfo(p)}
                <span class="star-on" title={t('fav.fromLibrary')}><Icon name="star" size={20} filled /></span>
              </a>
            </Swipeable>
          </li>
        {/each}
      </ul>
    {/if}
  {:else if creating || editing}
    <ProductForm product={editing} {draft} onsaved={saved} oncancel={cancelForm} />
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
          <li class="swipe-item">
            <Swipeable label={t('foods.deleteLabel', { name: p.name })} disabled={!p.canEdit} background="var(--surface)" ondelete={() => removeFood(p)}>
              <div class="list-row">
                <button class="item grow" type="button" onclick={() => (editing = p)}>
                  {@render productInfo(p)}
                </button>
                <button
                  class="icon-btn plain star"
                  class:star-on={p.starred}
                  type="button"
                  aria-pressed={p.starred}
                  aria-label={t('fav.starLabel', { name: p.name })}
                  onclick={() => setStar(p, !p.starred)}>
                  <Icon name="star" size={22} filled={p.starred} />
                </button>
              </div>
            </Swipeable>
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
  /* The divider sits on the item, so it stays put while the row slides. */
  .swipe-item + .swipe-item {
    border-top: 1px solid var(--border);
  }
  .swipe-item .list-row {
    border-top: none;
  }
  .use {
    display: flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .star-on {
    color: var(--accent-ink);
    display: inline-flex;
  }
  .name {
    font-weight: 600;
  }
  .block {
    display: block;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
</style>
