<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Add or edit a meal. Each food is a row of its own and is saved as its own diary entry.
     With ?favorite=new or ?favorite=<id> the same form makes or edits a favorite meal instead. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    isIsoDate,
    mealCategory,
    parseQuantity,
    splitFoods,
    todayIn,
    type AiStatus,
    type Entry,
    type Estimate,
    type Favorite,
    type FavoriteFood,
    type FoodCategory,
    type Product,
    type Slot,
    type Suggestion
  } from '@mealler/shared';
  import { ApiError, del, get, patch, post, put } from '$lib/api';
  import { preparePhoto, type PreparedPhoto } from '$lib/image';
  import { reveal } from '$lib/reveal';
  import { enqueueEntry, net, newClientId } from '$lib/offline.svelte';
  import { app, errorMessage, formatDate, t } from '$lib/state.svelte';
  import {
    applyEstimate,
    clearEstimate,
    hasBadNumber,
    hasValues,
    isEdited,
    newRow,
    rowFromItem,
    rowFromPart,
    rowQuantity,
    rowValues,
    setQuantity,
    setQuantityText,
    setValues,
    type FoodRow
  } from '$lib/foodRow';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Estimating from '$lib/Estimating.svelte';
  import FoodRowEditor from '$lib/FoodRowEditor.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import LibraryPicker from '$lib/LibraryPicker.svelte';

  const params = page.url.searchParams;
  const entryId = Number(params.get('entry')) || null;
  // The favorite editor: a name, an optional usual meal and the foods; no date, notes or photo kept.
  const favoriteMode = params.has('favorite');
  const favoriteEditId = Number(params.get('favorite')) || null;
  let favoriteName = $state('');
  // A favorite food is one food (its name may be left out); a favorite meal has a name and several.
  let favoriteKind = $state<'meal' | 'food'>(params.get('kind') === 'food' ? 'food' : 'meal');
  const foodMode = $derived(favoriteMode && favoriteKind === 'food');
  // Library foods the user starred: in the shortcuts, they open in "From the library" for their amount.
  let starredList = $state<Product[]>([]);
  let picker = $state<{ chooseProduct: (p: Product) => void } | undefined>();
  const today = todayIn(app.user?.timezone ?? 'UTC');
  const units = app.user?.units ?? 'metric';
  const locale = app.locale;

  let slots = $state<Slot[]>([]);
  let slotId = $state<number | null>(Number(params.get('slot')) || null);
  let date = $state(isIsoDate(params.get('d') ?? '') ? (params.get('d') as string) : today);
  let rows = $state<FoodRow[]>([newRow(units)]);
  let notes = $state('');
  let error = $state('');
  let splitMessage = $state('');
  let busy = $state(false);
  let loaded = $state(false);
  let libraryMessage = $state('');

  // ---------- Draft ----------
  // What was typed for a new meal survives a reload or a detour (the tab bar, a barcode to add to the
  // library first): it is kept for this slot and day, for an hour, until the meal is saved or closed with X.
  const DRAFT = 'mealler-add-draft';
  const draftFor = `${params.get('slot') ?? ''}|${params.get('d') ?? today}`;
  let draftRestored = $state(false);

  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT);
    } catch {
      // No session storage: there is no draft to clear.
    }
  }

  function restoreDraft() {
    try {
      const draft = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null') as
        | { for: string; at: number; slotId: number | null; notes: string; photoId: string | null; rows: FoodRow[] }
        | null;
      if (!draft || draft.for !== draftFor || Date.now() - draft.at > 60 * 60 * 1000) return;
      if (!draft.rows.some((r) => r.name.trim())) return;
      rows = draft.rows.map((r) => ({ ...r, key: newRow(units).key, estimating: false }));
      notes = draft.notes;
      photoId = existingPhotoId = draft.photoId;
      if (draft.slotId && slots.some((s) => s.id === draft.slotId)) slotId = draft.slotId;
      draftRestored = true;
    } catch {
      // Unreadable draft: start empty.
    }
  }

  $effect(() => {
    if (!loaded || entryId || favoriteMode) return;
    const draft = JSON.stringify({ for: draftFor, at: Date.now(), slotId, notes, photoId, rows });
    try {
      sessionStorage.setItem(DRAFT, draft);
    } catch {
      // Storage unavailable: the form simply has no draft.
    }
  });

  // In-app estimates
  let ai = $state<AiStatus | null>(null);
  let photo = $state<PreparedPhoto | null>(null);
  let existingPhotoId = $state<string | null>(null);
  let photoId = $state<string | null>(null);
  let photoEstimating = $state(false);
  // The picked photo is a nutrition table / ingredient list for one food, not the plate.
  let labelMode = false;
  let fileInput = $state<HTMLInputElement | null>(null);

  // Favorites and frequent meals (new entries only)
  let favoritesList = $state<Favorite[]>([]);
  let suggestions = $state<Suggestion[]>([]);
  let favSaved = $state(false);

  const aiUsable = $derived(!!ai?.enabled && !ai.capReached && !ai.limitReached);
  const canEstimate = $derived(aiUsable && net.online);
  const estimating = $derived(photoEstimating || rows.some((r) => r.estimating));
  const named = $derived(rows.filter((r) => r.name.trim()));
  // New foods without values (the entry being edited keeps its own status).
  const missingValues = $derived(named.filter((r) => !hasValues(r) && !(entryId && r === rows[0])));
  const back = $derived(favoriteMode ? '/favorites' : date === today ? '/' : `/?d=${date}`);
  const pageTitle = $derived(
    favoriteMode
      ? t(favoriteEditId ? 'fav.editTitle' : foodMode ? 'fav.newFoodTitle' : 'fav.newTitle')
      : entryId
        ? t('entry.titleEdit')
        : t('entry.titleNew')
  );

  onMount(async () => {
    try {
      // With the date, the slots added to that day only are offered too.
      const [all, status] = await Promise.all([
        get<Slot[]>(`/slots?date=${date}`),
        get<AiStatus>('/ai/status').catch(() => null)
      ]);
      ai = status;
      if (entryId) {
        const entry = await get<Entry>(`/entries/${entryId}`);
        slotId = entry.slotId;
        date = entry.date;
        notes = entry.notes ?? '';
        existingPhotoId = entry.photoId;
        const row = rows[0];
        row.name = entry.description;
        setQuantityText(row, entry.quantity, units, locale);
        setValues(row, entry, locale);
        row.items = entry.items;
        row.category = entry.category;
        // An entry may belong to an archived slot: keep it selectable.
        if (!all.some((s) => s.id === entry.slotId)) {
          const archived = await get<Slot[]>(`/slots?archived=1&date=${entry.date}`);
          const own = archived.find((s) => s.id === entry.slotId);
          if (own) all.push(own);
        }
      }
      slots = all;
      if (favoriteMode) {
        await loadFavorite(all);
        loaded = true;
        return;
      }
      if (!slotId && all.length) {
        // No slot asked for: today, the latest one whose time has come; otherwise the first.
        const now = new Intl.DateTimeFormat('en-GB', { timeZone: app.user?.timezone ?? 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
        const due = date === today ? all.filter((s) => s.time <= now).sort((a, b) => a.time.localeCompare(b.time)).at(-1) : undefined;
        slotId = (due ?? all[0]).id;
      }
      if (!entryId) {
        // The text field does not wait for these.
        void Promise.all([
          get<Favorite[]>('/favorites').catch(() => []),
          get<Suggestion[]>(`/suggestions${slotId ? `?slotId=${slotId}` : ''}`).catch(() => []),
          get<Product[]>('/products?starred=1').catch(() => [])
        ]).then(([favs, frequent, stars]) => {
          favoritesList = favs;
          suggestions = frequent;
          starredList = stars;
          // Opened from the Favorites page: that favorite is already in the form.
          const fav = favs.find((f) => f.id === Number(params.get('fav')));
          if (fav) {
            useQuick(fav);
            if (!params.get('slot') && fav.slotId && all.some((s) => s.id === fav.slotId)) slotId = fav.slotId;
          }
        });
        if (!params.get('fav')) restoreDraft();
      }
    } catch (e) {
      error = errorMessage(e);
    }
    loaded = true;
  });

  // ---------- Rows ----------

  /** Several foods typed in one row become one row each; a quantity in the text fills the quantity field. */
  function splitRow(index: number) {
    const row = rows[index];
    // A favorite food stays one food, whatever its name says.
    if (!row || foodMode) return;
    const parts = splitFoods(row.name);
    if (!parts.length) return;
    if (parts.length === 1) {
      const [part] = parts;
      if (part.quantity && !row.amount.trim()) {
        row.name = part.name;
        setQuantity(row, part.quantity, units, locale);
      }
      return;
    }
    // Values estimated for the whole text no longer fit the first food alone.
    if (row.estimatedValues) clearEstimate(row);
    const [first, ...rest] = parts;
    row.name = first.name;
    if (first.quantity) setQuantity(row, first.quantity, units, locale);
    rows.splice(index + 1, 0, ...rest.map((p) => rowFromPart(p, units, locale)));
    splitMessage = t('entry.splitDone', { n: rows.filter((r) => r.name.trim()).length });
  }

  function splitAll() {
    for (let i = rows.length - 1; i >= 0; i--) splitRow(i);
  }

  function addRow() {
    rows.push(newRow(units));
    const key = rows[rows.length - 1].key;
    requestAnimationFrame(() => document.getElementById(`food-${key}`)?.focus());
  }

  function removeRow(index: number) {
    rows.splice(index, 1);
    if (!rows.length) rows.push(newRow(units));
  }

  // ---------- Favorites ----------

  /** An empty row to fill, or a new one at the end. */
  function freeRow(): FoodRow {
    const row = rows.find((r) => !r.name.trim() && !hasValues(r));
    if (row) return row;
    rows.push(newRow(units));
    return rows[rows.length - 1];
  }

  /** Puts a saved food on a row: no new estimate needed. */
  function fillRow(row: FoodRow, food: FavoriteFood | Suggestion) {
    row.name = food.description;
    setQuantityText(row, food.quantity, units, locale);
    setValues(row, food, locale);
    row.items = food.items;
    row.category = food.category;
    row.estimatedValues = null;
    row.estimate = null;
  }

  /**
   * A favorite or a frequent meal fills an empty row, or adds one; a favorite of several foods adds a row
   * for each, to change or remove before saving. Its first row counts the use of the favorite.
   */
  function useQuick(q: Favorite | Suggestion) {
    const foods = 'foods' in q ? q.foods : [q];
    foods.forEach((food, i) => {
      const row = freeRow();
      fillRow(row, food);
      row.favoriteId = 'id' in q && i === 0 && !favoriteMode ? q.id : null;
    });
  }

  const foodOf = (row: FoodRow): FavoriteFood => ({
    description: row.name.trim(),
    quantity: rowQuantity(row, locale),
    ...rowValues(row),
    items: row.items,
    category: row.category
  });

  /** "Save to favorites" under a meal: one food keeps its own name, several ask for one. */
  async function saveFavorite() {
    if (!named.length || busy) return;
    let name: string | null = null;
    if (named.length > 1) {
      name = prompt(t('fav.namePrompt'), slots.find((s) => s.id === slotId)?.name ?? '')?.trim() || null;
      if (!name) return;
    }
    busy = true;
    error = '';
    try {
      if (name) await post('/favorites', { name, slotId, foods: named.map(foodOf) });
      else await post('/favorites', { ...foodOf(named[0]), slotId });
      favSaved = true;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  // ---------- Favorite editor ----------

  async function loadFavorite(all: Slot[]) {
    [favoritesList, starredList] = await Promise.all([
      get<Favorite[]>('/favorites').catch(() => []),
      get<Product[]>('/products?starred=1').catch(() => [])
    ]);
    if (!favoriteEditId) {
      slotId = null;
      return;
    }
    const fav = favoritesList.find((f) => f.id === favoriteEditId);
    if (!fav) {
      error = t('error.notFound');
      return;
    }
    favoriteKind = fav.foods.length > 1 ? 'meal' : 'food';
    // A favorite food named after its food shows an empty name: it follows the food.
    favoriteName = favoriteKind === 'food' && fav.name === fav.foods[0]?.description ? '' : fav.name;
    slotId = fav.slotId && all.some((s) => s.id === fav.slotId) ? fav.slotId : null;
    rows = fav.foods.map((food) => {
      const row = newRow(units);
      fillRow(row, food);
      return row;
    });
  }

  /** A food from the library becomes a row with its values for the amount chosen. */
  function pickProduct(p: Product, grams: number) {
    // A favorite food is the food just picked.
    if (foodMode) rows = [newRow(units)];
    const row = freeRow();
    const f = grams / 100;
    const r = (v: number) => Math.round(v * f * 10) / 10;
    row.name = [p.name, p.brand].filter(Boolean).join(' ');
    setQuantity(row, { amount: Math.round(grams * 10) / 10, unit: 'g' }, units, locale);
    setValues(row, { kcal: r(p.kcal), protein: r(p.protein), carbs: r(p.carbs), fat: r(p.fat), fiber: p.fiber == null ? null : r(p.fiber) }, locale);
    row.items = null;
    row.category = p.category;
    row.estimatedValues = null;
    row.estimate = null;
  }

  async function saveFavoriteMeal(event: SubmitEvent) {
    event.preventDefault();
    splitAll();
    const list = rows.filter((r) => r.name.trim());
    error = '';
    if (!list.length || (!foodMode && !favoriteName.trim())) {
      error = t(foodMode ? 'fav.needFood' : 'fav.needNameFoods');
      return;
    }
    if (list.some(hasBadNumber)) {
      error = t('error.number');
      return;
    }
    // A favorite is used without new estimates: every food needs its values.
    const missing = list.filter((r) => !hasValues(r));
    if (missing.length) {
      error = t('fav.needValues', { names: missing.map((r) => r.name.trim()).join(', ') });
      return;
    }
    busy = true;
    try {
      const name = favoriteName.trim() || list[0].name.trim().slice(0, 100);
      const body = { name, slotId, foods: (foodMode ? list.slice(0, 1) : list).map(foodOf) };
      if (favoriteEditId) await put(`/favorites/${favoriteEditId}`, body);
      else await post('/favorites', body);
      await goto(foodMode ? '/favorites?tab=foods' : '/favorites', { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  // Shortcuts: favorite meals on one line; favorite foods, starred library foods and frequent meals on another.
  interface Chip {
    key: string;
    label: string;
    star: boolean;
    category: FoodCategory;
    use: () => void;
  }
  const others = $derived(favoritesList.filter((f) => f.id !== favoriteEditId));
  const mealChips = $derived<Chip[]>(
    others
      .filter((f) => f.foods.length > 1)
      .map((f) => ({ key: `f${f.id}`, label: f.name, star: true, category: f.category ?? mealCategory([f.name, f.description], f.items), use: () => useQuick(f) }))
  );
  const foodChips = $derived<Chip[]>([
    ...others
      .filter((f) => f.foods.length <= 1)
      .map((f) => ({ key: `f${f.id}`, label: f.name, star: true, category: f.category ?? mealCategory([f.name, f.description], f.items), use: () => useQuick(f) })),
    ...starredList.map((p) => ({
      key: `p${p.id}`,
      label: p.name,
      star: true,
      category: p.category ?? mealCategory([p.name]),
      use: () => picker?.chooseProduct(p)
    })),
    ...suggestions
      .filter((s) => !favoritesList.some((f) => f.description.toLowerCase() === s.description.toLowerCase()))
      .map((s) => ({ key: `s${s.description}`, label: s.description, star: false, category: s.category ?? mealCategory([s.description], s.items), use: () => useQuick(s) }))
  ]);

  // ---------- Estimates ----------

  function noteAiError(e: unknown) {
    error = errorMessage(e);
    if (e instanceof ApiError && ai) {
      if (e.code === 'aiCapReached' || e.code === 'aiInstanceCap') ai.capReached = true;
      if (e.code === 'aiDailyLimit') ai.limitReached = true;
    }
  }

  async function estimateRow(row: FoodRow) {
    if (!row.name.trim()) return;
    row.estimating = true;
    error = '';
    try {
      const res = await post<{ estimate: Estimate; photoId: string | null }>('/ai/estimate', {
        description: row.name.trim(),
        quantity: rowQuantity(row, locale),
        photo: null
      });
      if (ai) ai.requestsToday += 1;
      applyEstimate(row, res.estimate, locale);
    } catch (e) {
      noteAiError(e);
    } finally {
      row.estimating = false;
    }
  }

  async function estimateRowAt(index: number) {
    splitRow(index);
    await estimateRow(rows[index]);
  }

  /** "Stima": every food without values, one after the other. */
  async function estimateAll() {
    splitAll();
    for (const row of rows) {
      if (!row.name.trim() || hasValues(row)) continue;
      if (!aiUsable) break;
      await estimateRow(row);
    }
  }

  async function pickPhoto(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      photo = await preparePhoto(file);
      await (labelMode ? estimateLabel() : estimatePhoto());
    } catch (e) {
      error = errorMessage(e);
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  /** A photo of the plate: every food Claude sees becomes a row with its values. */
  async function estimatePhoto() {
    if (!photo) return;
    // The foods Claude sees replace the rows: ask before values already there (typed or paid for) are lost.
    if (rows.some((r) => r.name.trim() && hasValues(r)) && !confirm(t('ai.photoReplace'))) {
      photo = null;
      return;
    }
    splitAll();
    photoEstimating = true;
    error = '';
    try {
      const context = named.map((r) => [rowQuantity(r, locale), r.name.trim()].filter(Boolean).join(' ')).join(', ');
      const res = await post<{ estimate: Estimate; photoId: string | null }>('/ai/estimate', {
        description: context,
        quantity: null,
        photo: { mime: photo.mime, data: photo.data }
      });
      if (ai) ai.requestsToday += 1;
      if (res.photoId) photoId = res.photoId;
      const estimate = res.estimate;
      rows = estimate.items.length
        ? estimate.items.map((item) => rowFromItem(item, estimate, units, locale))
        : [newRow(units, estimate.description)];
      if (rows.length > 1) splitMessage = t('entry.splitDone', { n: rows.length });
    } catch (e) {
      noteAiError(e);
    } finally {
      photoEstimating = false;
    }
  }

  /**
   * A nutrition table or an ingredient list (photo or screenshot) for one food: it fills the first
   * food still without values, keeping its name; the quantity comes from the image when not typed.
   */
  async function estimateLabel() {
    if (!photo) return;
    splitAll();
    let row = rows.find((r) => !hasValues(r));
    if (!row) {
      rows.push(newRow(units));
      row = rows[rows.length - 1];
    }
    photoEstimating = true;
    error = '';
    try {
      const res = await post<{ estimate: Estimate; photoId: string | null }>('/ai/estimate', {
        description: row.name.trim(),
        quantity: rowQuantity(row, locale),
        photo: { mime: photo.mime, data: photo.data },
        label: true
      });
      if (ai) ai.requestsToday += 1;
      if (res.photoId) photoId = res.photoId;
      const estimate = res.estimate;
      if (!row.name.trim()) row.name = estimate.description;
      if (!rowQuantity(row, locale)) {
        // The portion is the sum of the listed amounts, when they are all weights or volumes.
        const qs = estimate.items.map((i) => parseQuantity(i.quantity ?? ''));
        const unit = qs[0]?.unit;
        if (unit && (unit === 'g' || unit === 'ml') && qs.every((q) => q?.unit === unit)) {
          setQuantity(row, { amount: qs.reduce((s, q) => s + q!.amount, 0), unit }, units, locale);
        }
      }
      applyEstimate(row, estimate, locale);
    } catch (e) {
      noteAiError(e);
    } finally {
      photoEstimating = false;
    }
  }

  // ---------- Save ----------

  function bodyFor(row: FoodRow, index: number, isExisting: boolean): Record<string, unknown> & { date: string } {
    const body: Record<string, unknown> & { date: string } = {
      slotId,
      date,
      description: row.name.trim(),
      quantity: rowQuantity(row, locale),
      category: row.category,
      ...rowValues(row)
    };
    // The meal's notes and photo go on its first entry.
    body.notes = index === 0 ? notes || null : null;
    if (index === 0 && photoId) body.photoId = photoId;
    if (row.estimatedValues) {
      body.items = row.items;
      body.estimate = isEdited(row) ? 'corrected' : 'calculated';
    }
    // Nothing entered and in-app estimates on: save now, Claude fills the values in the background.
    if (!isExisting && !hasValues(row) && aiUsable) body.calculate = true;
    if (!isExisting) body.clientId = newClientId();
    if (!isExisting && row.favoriteId) body.favoriteId = row.favoriteId;
    return body;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!slotId) return;
    splitAll();
    const list = rows.filter((r) => r.name.trim());
    if (!list.length) {
      error = t('error.validation');
      return;
    }
    if (list.some(hasBadNumber)) {
      error = t('error.number');
      return;
    }
    busy = true;
    error = '';
    const bodies = list.map((row, i) => bodyFor(row, i, !!entryId && i === 0));
    try {
      if (entryId) {
        await patch(`/entries/${entryId}`, bodies[0]);
        if (bodies.length > 1) await post('/entries/batch', { entries: bodies.slice(1) });
      } else if (bodies.length === 1) {
        await post('/entries', bodies[0]);
      } else {
        await post('/entries/batch', { entries: bodies });
      }
      clearDraft();
      // The form leaves the history: "back" from the diary does not open it again.
      await goto(back, { replaceState: true });
    } catch (e) {
      if (!entryId && e instanceof ApiError && e.code === 'offline') {
        // No connection: keep the entries on the device, they are sent when the network returns.
        if (bodies.map((body) => enqueueEntry(body)).every(Boolean)) {
          clearDraft();
          await goto(date === today ? '/?queued=1' : `/?d=${date}&queued=1`, { replaceState: true });
        } else {
          error = t('offline.notStored');
        }
      } else {
        error = errorMessage(e);
      }
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!entryId || !confirm(t('entry.deleteConfirm'))) return;
    busy = true;
    try {
      await del(`/entries/${entryId}`);
      await goto(back, { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
      busy = false;
    }
  }
</script>

<svelte:head><title>{pageTitle} · Mealler</title></svelte:head>

<main class="page">
  <TopBar
    title={pageTitle}
    subtitle={favoriteMode ? '' : formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}
    section={favoriteMode ? 'favorites' : undefined}>
    {#snippet actions()}
      <a class="icon-btn" href={back} aria-label={t('common.close')} onclick={clearDraft}><Icon name="close" /></a>
    {/snippet}
  </TopBar>

  {#if loaded}
    <form class="stack" onsubmit={favoriteMode ? saveFavoriteMeal : save}>
      {#if favoriteMode}
        <div class="field">
          <label for="fav-name">{t('fav.name')}{#if foodMode} <span class="muted small">({t('common.optional')})</span>{/if}</label>
          <input
            id="fav-name"
            required={!foodMode}
            maxlength="100"
            placeholder={foodMode ? t('fav.namePlaceholderFood') : t('fav.namePlaceholder')}
            bind:value={favoriteName} />
        </div>
      {/if}
      {#if !foodMode}
      <fieldset class="field" style="border: none; margin: 0; padding: 0; min-width: 0">
        <legend class="label" style="padding: 0; margin-bottom: 8px">
          {#if favoriteMode}{t('fav.usualSlot')} <span class="muted small">({t('common.optional')})</span>{:else}{t('entry.slot')}{/if}
        </legend>
        <div class="chips">
          {#each slots as slot (slot.id)}
            <!-- In the favorite editor the usual meal can be left out: a second tap clears it. -->
            <button type="button" class="chip" aria-pressed={slotId === slot.id} onclick={() => (slotId = favoriteMode && slotId === slot.id ? null : slot.id)}>
              {#if slotId === slot.id}<Icon name="check" size={18} stroke={2.5} />{/if}
              {slot.name}
            </button>
          {/each}
        </div>
      </fieldset>
      {/if}

      {#if !entryId}
        <!-- A food logged from the library goes straight to the diary: with other foods still typed here, stay. -->
        <LibraryPicker
          bind:this={picker}
          {slotId}
          {date}
          productId={Number(params.get('product')) || null}
          onpick={favoriteMode ? pickProduct : undefined}
          back={favoriteMode ? `/add?favorite=${favoriteEditId ?? 'new'}${foodMode && !favoriteEditId ? '&kind=food' : ''}` : null}
          onlogged={() => {
            if (named.length) libraryMessage = t('foods.logged');
            else {
              clearDraft();
              void goto(back, { replaceState: true });
            }
          }} />
        {#if libraryMessage}<p class="notice" role="status">{libraryMessage}</p>{/if}
      {/if}

      {#if !entryId && !foodMode}
        {#each [{ id: 'quick-meals', title: t('fav.quickMeals'), chips: mealChips }, { id: 'quick-foods', title: t('fav.quickFoods'), chips: foodChips }] as group (group.id)}
          {#if group.chips.length}
            <section class="field" aria-labelledby={group.id}>
              <h2 id={group.id} class="label">{group.title}</h2>
              <div class="chips">
                {#each group.chips as q (q.key)}
                  <button type="button" class="chip" aria-label={t('fav.use', { name: q.label })} onclick={q.use}>
                    <FoodIcon category={q.category} size={24} badge={false} />{q.label}{#if q.star}<Icon name="star" size={16} />{/if}
                  </button>
                {/each}
              </div>
            </section>
          {/if}
        {/each}
      {/if}

      <section class="what" aria-labelledby="what-title">
        <div class="what-head">
          <h2 id="what-title" class="label">{foodMode ? t('fav.whatFood') : favoriteMode ? t('fav.what') : t('entry.what')}</h2>
          <button class="tips-btn" type="button" popovertarget="tips" aria-label={t('entry.tipsOpen')}>?</button>
        </div>
        <div id="tips" class="tips card" popover aria-labelledby="tips-title">
          <div class="tips-head">
            <span class="tips-icon"><img src="/diary.svg" alt="" width="40" height="40" draggable="false" /></span>
            <h3 id="tips-title" class="label">{t('entry.tipsTitle')}</h3>
          </div>
          <ul>
            {#each ['entry.whatHelp', 'entry.tipDish', 'entry.tipSplit', 'entry.tipRaw', 'entry.tipFat', 'entry.tipPortion', 'entry.tipDetails'] as const as tip (tip)}
              <li>{t(tip)}</li>
            {/each}
          </ul>
          <button class="btn btn-ghost" type="button" popovertarget="tips" popovertargetaction="hide">{t('common.close')}</button>
        </div>
        <div class="rows">
          {#each rows as row, i (row.key)}
            <FoodRowEditor
              bind:row={rows[i]}
              index={i}
              {units}
              removable={rows.length > 1 && !(entryId && i === 0)}
              {canEstimate}
              onestimate={() => estimateRowAt(i)}
              onremove={() => removeRow(i)}
              onsplit={() => splitRow(i)} />
          {/each}
        </div>
        {#if !foodMode}
          <button class="btn btn-ghost add-food" type="button" onclick={addRow}><Icon name="plus" size={20} stroke={2.5} />{t('entry.addFood')}</button>
        {/if}
        {#if draftRestored}<p class="notice" role="status">{t('entry.draftRestored')}</p>{/if}
        {#if splitMessage}<p class="notice" role="status">{splitMessage}</p>{/if}
      </section>

      {#if canEstimate}
        <div class="ai-actions">
          <!-- A photo of the plate makes a row per food: not for a favorite food, which is one. -->
          {#if !foodMode}
            <button class="btn" type="button" disabled={estimating} onclick={() => { labelMode = false; fileInput?.click(); }}>
              <Icon name="camera" size={20} />{t('ai.photo')}
            </button>
          {/if}
          <button class="btn" type="button" disabled={estimating} onclick={() => { labelMode = true; fileInput?.click(); }}>
            <Icon name="camera" size={20} />{t('ai.labelPhoto')}
          </button>
          <button class="btn btn-primary" type="button" disabled={estimating || !named.length} onclick={estimateAll}>
            <Icon name="sparkle" size={20} />{t('ai.calculate')}
          </button>
          <input bind:this={fileInput} class="visually-hidden" type="file" accept="image/*" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
        </div>
      {:else if ai?.enabled && ai.capReached}
        <p class="notice">{t('ai.capReached')}</p>
      {:else if ai?.enabled && ai.limitReached}
        <p class="notice">{t('ai.limitReached')}</p>
      {/if}
      {#if aiUsable && ai?.dailyRequests}
        <p class="help">{t('ai.remaining', { n: ai.requestsToday, max: ai.dailyRequests })}</p>
      {/if}
      {#if !aiUsable && ai?.enabled !== false}
        <p class="help">{t('entry.valuesHelp')}</p>
      {:else if aiUsable && missingValues.length && !favoriteMode}
        <p class="help">{t('ai.laterHint')}</p>
      {/if}

      {#if photoEstimating}
        <p class="notice" role="status"><Estimating /></p>
      {/if}

      {#if (photo || existingPhotoId) && !favoriteMode}
        <figure class="photo">
          <img src={photo?.previewUrl ?? `/api/photos/${existingPhotoId}`} alt={t('ai.photoAlt')} />
          {#if photo}
            <button class="btn btn-ghost" type="button" onclick={() => { photo = null; photoId = null; }}>{t('ai.photoRemove')}</button>
          {/if}
        </figure>
      {/if}

      {#if !favoriteMode}
        <div class="field">
          <label for="date">{t('entry.date')}</label>
          <input id="date" type="date" required bind:value={date} />
        </div>

        <div class="field">
          <label for="notes">{t('entry.notes')} <span class="muted small">({t('common.optional')})</span></label>
          <textarea id="notes" rows="2" maxlength="2000" aria-describedby={named.length > 1 ? 'notes-help' : undefined} bind:value={notes}></textarea>
          {#if named.length > 1}<p id="notes-help" class="help">{t('entry.notesFirst')}</p>{/if}
        </div>
      {/if}

      {#if error}<p class="error" role="alert" use:reveal>{error}</p>{/if}

      <div class="footer">
        {#if favoriteMode}
          <button class="btn btn-primary btn-block" type="submit" disabled={busy || estimating}>
            <Icon name="star" size={20} />{t('fav.saveMeal')}
          </button>
        {:else}
          <button class="btn btn-primary btn-block" type="submit" disabled={busy || estimating || !slotId}>
            {named.length > 1 ? t('entry.saveMany', { n: named.length }) : t('entry.save')}
          </button>
        {/if}
        {#if !favoriteMode && named.length && named.every(hasValues)}
          <button class="btn btn-block" type="button" disabled={busy || favSaved} onclick={saveFavorite}>
            <Icon name="star" size={20} />{favSaved ? t('fav.saved') : t('fav.save')}
          </button>
        {/if}
        {#if entryId}
          <button class="btn btn-danger btn-block" type="button" disabled={busy} onclick={remove}>
            <Icon name="trash" size={20} />{t('entry.delete')}
          </button>
        {/if}
      </div>
    </form>
  {:else}
    <p class="muted" role="status">{t('common.loading')}</p>
  {/if}
</main>

<style>
  .what {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .what-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .tips-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .tips {
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    margin: auto;
    padding: 20px;
    color: inherit;
  }
  .tips-head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  /* Same tinted tile as the food-category icons. */
  .tips-icon {
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: 23%;
    background: color-mix(in srgb, #0f766e 18%, var(--surface));
    display: grid;
    place-items: center;
  }
  .tips-icon img {
    display: block;
    user-select: none;
  }
  .tips::backdrop {
    background: rgb(0 0 0 / 0.4);
  }
  .tips ul {
    margin: 12px 0 16px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .add-food {
    align-self: flex-start;
    padding: 0 12px;
  }
  .footer {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .ai-actions .btn-primary {
    grid-column: 1 / -1;
  }
  .photo {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
  }
  .photo img {
    width: 100%;
    max-height: 280px;
    object-fit: cover;
    border-radius: 16px;
    border: 1px solid var(--border);
  }
</style>
