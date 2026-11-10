<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Add or edit a meal. Each food is a row of its own and is saved as its own diary entry. -->
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
    type Slot,
    type Suggestion
  } from '@mealler/shared';
  import { ApiError, del, get, patch, post } from '$lib/api';
  import { preparePhoto, type PreparedPhoto } from '$lib/image';
  import { reveal } from '$lib/reveal';
  import { enqueueEntry, net } from '$lib/offline.svelte';
  import { app, errorMessage, formatDate, t } from '$lib/state.svelte';
  import {
    applyEstimate,
    clearEstimate,
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
  const back = $derived(date === today ? '/' : `/?d=${date}`);

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
      if (!slotId && all.length) slotId = all[0].id;
      if (!entryId) {
        [favoritesList, suggestions] = await Promise.all([
          get<Favorite[]>('/favorites').catch(() => []),
          get<Suggestion[]>(`/suggestions${slotId ? `?slotId=${slotId}` : ''}`).catch(() => [])
        ]);
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
    if (!row) return;
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

  /** A favorite or a frequent meal fills an empty row, or adds one: no new estimate needed. */
  function useQuick(q: Favorite | Suggestion) {
    let row = rows.find((r) => !r.name.trim() && !hasValues(r));
    if (!row) {
      rows.push(newRow(units));
      row = rows[rows.length - 1];
    }
    row.name = q.description;
    setQuantityText(row, q.quantity, units, locale);
    setValues(row, q, locale);
    row.items = q.items;
    row.category = q.category;
    row.estimatedValues = null;
    row.estimate = null;
  }

  async function saveFavorite() {
    const row = named[0];
    if (!row) return;
    error = '';
    try {
      await post('/favorites', {
        description: row.name.trim(),
        quantity: rowQuantity(row, locale),
        ...rowValues(row),
        items: row.items,
        slotId,
        category: row.category
      });
      favSaved = true;
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const quick = $derived([
    ...favoritesList.slice(0, 6).map((f) => ({ key: `f${f.id}`, label: f.name, star: true, value: f as Favorite | Suggestion })),
    ...suggestions
      .filter((s) => !favoritesList.some((f) => f.description.toLowerCase() === s.description.toLowerCase()))
      .map((s) => ({ key: `s${s.description}`, label: s.description, star: false, value: s as Favorite | Suggestion }))
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
      await goto(back);
    } catch (e) {
      if (!entryId && e instanceof ApiError && e.code === 'offline') {
        // No connection: keep the entries on the device, they are sent when the network returns.
        for (const body of bodies) enqueueEntry(body);
        await goto(date === today ? '/?queued=1' : `/?d=${date}&queued=1`);
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
      await goto(back);
    } catch (e) {
      error = errorMessage(e);
      busy = false;
    }
  }
</script>

<svelte:head><title>{entryId ? t('entry.titleEdit') : t('entry.titleNew')} · Mealler</title></svelte:head>

<main class="page">
  <TopBar
    title={entryId ? t('entry.titleEdit') : t('entry.titleNew')}
    subtitle={formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}>
    {#snippet actions()}
      <a class="icon-btn" href={back} aria-label={t('common.close')}><Icon name="close" /></a>
    {/snippet}
  </TopBar>

  {#if loaded}
    <form class="stack" onsubmit={save}>
      <fieldset class="field" style="border: none; margin: 0; padding: 0; min-width: 0">
        <legend class="label" style="padding: 0; margin-bottom: 8px">{t('entry.slot')}</legend>
        <div class="chips">
          {#each slots as slot (slot.id)}
            <button type="button" class="chip" aria-pressed={slotId === slot.id} onclick={() => (slotId = slot.id)}>
              {#if slotId === slot.id}<Icon name="check" size={18} stroke={2.5} />{/if}
              {slot.name}
            </button>
          {/each}
        </div>
      </fieldset>

      {#if !entryId}
        <LibraryPicker {slotId} {date} onlogged={() => goto(back)} />
      {/if}

      {#if !entryId && quick.length}
        <section class="field" aria-labelledby="quick-title">
          <h2 id="quick-title" class="label">{t('fav.quick')}</h2>
          <div class="chips">
            {#each quick as q (q.key)}
              <button type="button" class="chip" aria-label={t('fav.use', { name: q.label })} onclick={() => useQuick(q.value)}>
                <FoodIcon category={q.value.category ?? mealCategory([q.label, q.value.description], q.value.items)} size={24} badge={false} />{q.label}{#if q.star}<Icon name="star" size={16} />{/if}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <section class="what" aria-labelledby="what-title">
        <div class="what-head">
          <h2 id="what-title" class="label">{t('entry.what')}</h2>
          <button class="tips-btn" type="button" popovertarget="tips" aria-label={t('entry.tipsOpen')}>?</button>
        </div>
        <div id="tips" class="tips card" popover aria-labelledby="tips-title">
          <h3 id="tips-title" class="label">{t('entry.tipsTitle')}</h3>
          <ul>
            {#each ['entry.tipDish', 'entry.tipSplit', 'entry.tipRaw', 'entry.tipFat', 'entry.tipPortion', 'entry.tipDetails'] as const as tip (tip)}
              <li>{t(tip)}</li>
            {/each}
          </ul>
          <button class="btn btn-ghost" type="button" popovertarget="tips" popovertargetaction="hide">{t('common.close')}</button>
        </div>
        <p id="what-help" class="help">{t('entry.whatHelp')}</p>
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
        <button class="btn btn-ghost add-food" type="button" onclick={addRow}><Icon name="plus" size={20} stroke={2.5} />{t('entry.addFood')}</button>
        {#if splitMessage}<p class="notice" role="status">{splitMessage}</p>{/if}
      </section>

      {#if canEstimate}
        <div class="ai-actions">
          <button class="btn" type="button" disabled={estimating} onclick={() => { labelMode = false; fileInput?.click(); }}>
            <Icon name="camera" size={20} />{t('ai.photo')}
          </button>
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
      {#if ai && !ai.enabled}
        <p class="help">{t('ai.disabled')}</p>
      {:else if !aiUsable}
        <p class="help">{t('entry.valuesHelp')}</p>
      {:else if missingValues.length}
        <p class="help">{t('ai.laterHint')}</p>
      {/if}

      {#if photoEstimating}
        <p class="notice" role="status"><Estimating /></p>
      {/if}

      {#if photo || existingPhotoId}
        <figure class="photo">
          <img src={photo?.previewUrl ?? `/api/photos/${existingPhotoId}`} alt={t('ai.photoAlt')} />
          {#if photo}
            <button class="btn btn-ghost" type="button" onclick={() => { photo = null; photoId = null; }}>{t('ai.photoRemove')}</button>
          {/if}
        </figure>
      {/if}

      <div class="field">
        <label for="date">{t('entry.date')}</label>
        <input id="date" type="date" required bind:value={date} />
      </div>

      <div class="field">
        <label for="notes">{t('entry.notes')} <span class="muted small">({t('common.optional')})</span></label>
        <textarea id="notes" rows="2" maxlength="2000" aria-describedby={named.length > 1 ? 'notes-help' : undefined} bind:value={notes}></textarea>
        {#if named.length > 1}<p id="notes-help" class="help">{t('entry.notesFirst')}</p>{/if}
      </div>

      {#if error}<p class="error" role="alert" use:reveal>{error}</p>{/if}

      <div class="footer">
        <button class="btn btn-primary btn-block" type="submit" disabled={busy || estimating || !slotId}>
          {named.length > 1 ? t('entry.saveMany', { n: named.length }) : t('entry.save')}
        </button>
        {#if named.length === 1 && hasValues(named[0])}
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
