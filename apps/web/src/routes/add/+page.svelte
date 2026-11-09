<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    NUTRIENTS,
    isIsoDate,
    kcalMismatch,
    todayIn,
    type AiStatus,
    type Entry,
    type Estimate,
    type EstimateItem,
    type Favorite,
    type Nutrient,
    type Suggestion,
    type Slot
  } from '@mealler/shared';
  import { ApiError, del, get, patch, post } from '$lib/api';
  import { preparePhoto, type PreparedPhoto } from '$lib/image';
  import { enqueueEntry, net } from '$lib/offline.svelte';
  import { app, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import LibraryPicker from '$lib/LibraryPicker.svelte';

  const params = page.url.searchParams;
  const entryId = Number(params.get('entry')) || null;
  const today = todayIn(app.user?.timezone ?? 'UTC');

  let slots = $state<Slot[]>([]);
  let slotId = $state<number | null>(Number(params.get('slot')) || null);
  let date = $state(isIsoDate(params.get('d') ?? '') ? (params.get('d') as string) : today);
  let description = $state('');
  let quantity = $state('');
  let notes = $state('');
  const nutrients: { key: Nutrient; unit: string }[] = [
    { key: 'kcal', unit: 'kcal' },
    { key: 'protein', unit: 'g' },
    { key: 'carbs', unit: 'g' },
    { key: 'fat', unit: 'g' },
    { key: 'fiber', unit: 'g' }
  ];
  let values = $state<Record<Nutrient, string>>({ kcal: '', protein: '', carbs: '', fat: '', fiber: '' });
  let error = $state('');
  let busy = $state(false);
  let loaded = $state(false);

  // In-app estimate (milestone 4)
  let ai = $state<AiStatus | null>(null);
  let photo = $state<PreparedPhoto | null>(null);
  let existingPhotoId = $state<string | null>(null);
  let photoId = $state<string | null>(null);
  let estimating = $state(false);
  let estimate = $state<Estimate | null>(null);
  let items = $state<EstimateItem[] | null>(null);
  let estimatedValues = $state<Record<Nutrient, string> | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  // Favorites and frequent meals (new entries only)
  let favoritesList = $state<Favorite[]>([]);
  let suggestions = $state<Suggestion[]>([]);
  let favSaved = $state(false);

  const toNumber = (s: string): number | null => {
    const trimmed = s.trim().replace(',', '.');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const toText = (n: number | null | undefined) =>
    n == null ? '' : String(n).replace('.', app.locale === 'it' ? ',' : '.');

  const parsed = $derived({
    kcal: toNumber(values.kcal),
    protein: toNumber(values.protein),
    carbs: toNumber(values.carbs),
    fat: toNumber(values.fat),
    fiber: toNumber(values.fiber)
  });
  const mismatch = $derived(kcalMismatch(parsed));
  const noValues = $derived(NUTRIENTS.every((n) => parsed[n] == null));
  const aiUsable = $derived(!!ai?.enabled && !ai.capReached && !ai.limitReached);
  const edited = $derived(!!estimatedValues && NUTRIENTS.some((n) => values[n] !== estimatedValues![n]));
  // The values section is a collapsible panel; its summary line shows the totals when closed.
  let valuesOpen = $state(false);
  const valuesSummary = $derived(
    noValues
      ? t('entry.valuesEmpty')
      : [
          parsed.kcal != null ? `${formatNumber(parsed.kcal)} kcal` : null,
          parsed.protein != null ? `${t('entry.shortProtein')} ${formatNumber(parsed.protein, 1)} g` : null,
          parsed.carbs != null ? `${t('entry.shortCarbs')} ${formatNumber(parsed.carbs, 1)} g` : null,
          parsed.fat != null ? `${t('entry.shortFat')} ${formatNumber(parsed.fat, 1)} g` : null
        ]
          .filter(Boolean)
          .join(' · ')
  );
  const back = $derived(date === today ? '/' : `/?d=${date}`);

  onMount(async () => {
    try {
      const [all, status] = await Promise.all([
        get<Slot[]>('/slots'),
        get<AiStatus>('/ai/status').catch(() => null)
      ]);
      ai = status;
      if (entryId) {
        const entry = await get<Entry>(`/entries/${entryId}`);
        slotId = entry.slotId;
        date = entry.date;
        description = entry.description;
        quantity = entry.quantity ?? '';
        notes = entry.notes ?? '';
        items = entry.items;
        existingPhotoId = entry.photoId;
        for (const n of nutrients) values[n.key] = toText(entry[n.key]);
        // An entry may belong to an archived slot: keep it selectable.
        if (!all.some((s) => s.id === entry.slotId)) {
          const archived = await get<Slot[]>('/slots?archived=1');
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

  /** Fills the form from a favorite or a frequent meal: no new estimate needed. */
  function useQuick(q: Favorite | Suggestion) {
    description = q.description;
    quantity = q.quantity ?? '';
    for (const n of NUTRIENTS) values[n] = toText(q[n]);
    items = q.items;
    estimate = null;
    estimatedValues = null;
  }

  async function saveFavorite() {
    error = '';
    try {
      await post('/favorites', {
        description,
        quantity: quantity || null,
        ...parsed,
        items,
        slotId
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

  async function pickPhoto(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    try {
      photo = await preparePhoto(file);
      await runEstimate();
    } catch {
      error = t('common.error');
    } finally {
      if (fileInput) fileInput.value = '';
    }
  }

  async function runEstimate() {
    if (!description.trim() && !photo) return;
    estimating = true;
    error = '';
    try {
      const res = await post<{ estimate: Estimate; photoId: string | null }>('/ai/estimate', {
        description,
        quantity: quantity || null,
        photo: photo ? { mime: photo.mime, data: photo.data } : null
      });
      estimate = res.estimate;
      if (ai) ai.requestsToday += 1;
      items = res.estimate.items;
      if (res.photoId) photoId = res.photoId;
      if (!description.trim()) description = res.estimate.description;
      for (const n of NUTRIENTS) values[n] = toText(res.estimate.totals[n]);
      estimatedValues = { ...values };
    } catch (e) {
      error = errorMessage(e);
      if (e instanceof ApiError && ai) {
        if (e.code === 'aiCapReached' || e.code === 'aiInstanceCap') ai.capReached = true;
        if (e.code === 'aiDailyLimit') ai.limitReached = true;
      }
    } finally {
      estimating = false;
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!slotId) return;
    busy = true;
    error = '';
    const body: Record<string, unknown> & { date: string } = {
      slotId,
      date,
      description,
      quantity: quantity || null,
      notes: notes || null,
      ...parsed
    };
    if (estimatedValues) {
      body.items = items;
      body.estimate = edited ? 'corrected' : 'calculated';
    }
    if (photoId) body.photoId = photoId;
    // Nothing entered and in-app estimates on: save now, Claude fills the values in the background.
    if (!entryId && noValues && aiUsable) body.calculate = true;
    try {
      if (entryId) await patch(`/entries/${entryId}`, body);
      else await post('/entries', body);
      await goto(back);
    } catch (e) {
      if (!entryId && e instanceof ApiError && e.code === 'offline') {
        // No connection: keep the entry on the device, it is sent when the network returns.
        enqueueEntry(body);
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
                {#if q.star}<Icon name="star" size={16} />{/if}{q.label}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      <div class="field">
        <label for="what">{t('entry.what')}</label>
        <textarea id="what" rows="3" maxlength="1000" aria-describedby="what-help" required={!photo} bind:value={description}></textarea>
        <p id="what-help" class="help">{t('entry.whatHelp')}</p>
      </div>

      {#if aiUsable && net.online}
        <div class="ai-actions">
          <button class="btn" type="button" disabled={estimating} onclick={() => fileInput?.click()}>
            <Icon name="camera" size={20} />{t('ai.photo')}
          </button>
          <button class="btn btn-primary" type="button" disabled={estimating || (!description.trim() && !photo)} onclick={runEstimate}>
            <Icon name="sparkle" size={20} />{t('ai.calculate')}
          </button>
          <input bind:this={fileInput} class="visually-hidden" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true" onchange={pickPhoto} />
        </div>
      {:else if ai?.enabled && ai.capReached}
        <p class="notice">{t('ai.capReached')}</p>
      {:else if ai?.enabled && ai.limitReached}
        <p class="notice">{t('ai.limitReached')}</p>
      {/if}
      {#if aiUsable && ai?.dailyRequests}
        <p class="help">{t('ai.remaining', { n: ai.requestsToday, max: ai.dailyRequests })}</p>
      {/if}

      {#if photo || existingPhotoId}
        <figure class="photo">
          <img src={photo?.previewUrl ?? `/api/photos/${existingPhotoId}`} alt={t('ai.photoAlt')} />
          {#if photo}
            <button class="btn btn-ghost" type="button" onclick={() => { photo = null; photoId = null; }}>{t('ai.photoRemove')}</button>
          {/if}
        </figure>
      {/if}

      {#if estimating}
        <p class="notice working" role="status"><Icon name="sparkle" size={18} />{t('ai.working')}</p>
      {/if}

      {#if items?.length}
        <section class="card stack estimate" aria-labelledby="est-title">
          <div class="est-head">
            <Icon name="sparkle" size={20} />
            <h2 id="est-title" class="label grow">{t('ai.estimate')}</h2>
            {#if aiUsable && net.online && (description.trim() || photo)}
              <button class="btn btn-ghost" type="button" disabled={estimating} onclick={runEstimate}>{t('ai.recalculate')}</button>
            {/if}
          </div>
          <ul>
            {#each items as item, i (i)}
              <li>
                <span>{item.name}{#if item.quantity} · {item.quantity}{/if}</span>
                <span class="muted">{formatNumber(item.kcal)} kcal</span>
              </li>
            {/each}
          </ul>
          {#if estimate}
            <p class="help">
              {t(`ai.confidence.${estimate.confidence}`)}{#if estimate.notes} — {estimate.notes}{/if}
            </p>
          {/if}
          <p class="help"><Icon name="alert" size={16} /> {t('ai.editHint')}</p>
        </section>
      {/if}

      <div class="field">
        <label for="quantity">{t('entry.quantity')} <span class="muted small">({t('common.optional')})</span></label>
        <input id="quantity" maxlength="200" bind:value={quantity} />
      </div>

      <details class="card values" bind:open={valuesOpen}>
        <summary>
          <span class="grow">
            <span class="label">{t('entry.values')}</span>
            <span class="muted small summary-line">{valuesSummary}</span>
          </span>
          <Icon name="chevron" size={20} />
        </summary>
        <div class="stack values-body">
        {#if ai && !ai.enabled}
          <p class="help">{t('ai.disabled')}</p>
        {:else if !aiUsable}
          <p class="help">{t('entry.valuesHelp')}</p>
        {:else if !entryId && noValues}
          <p class="help">{t('ai.laterHint')}</p>
        {/if}
        <div class="grid">
          {#each nutrients as n (n.key)}
            <div class="field">
              <label for="v-{n.key}">{t(`nutrient.${n.key}`)} <span class="muted small">({n.unit})</span></label>
              <input id="v-{n.key}" inputmode="decimal" autocomplete="off" bind:value={values[n.key]} />
            </div>
          {/each}
        </div>
        </div>
      </details>
      {#if mismatch}
        <p class="warn" role="status"><Icon name="alert" size={18} />{t('entry.mismatch')}</p>
      {/if}

      <div class="field">
        <label for="date">{t('entry.date')}</label>
        <input id="date" type="date" required bind:value={date} />
      </div>

      <div class="field">
        <label for="notes">{t('entry.notes')} <span class="muted small">({t('common.optional')})</span></label>
        <textarea id="notes" rows="2" maxlength="2000" bind:value={notes}></textarea>
      </div>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="footer">
        <button class="btn btn-primary btn-block" type="submit" disabled={busy || estimating || !slotId}>{t('entry.save')}</button>
        {#if description.trim() && !noValues}
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
  .values {
    padding: 0;
  }
  .values summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    padding: 12px 16px 12px 20px;
    cursor: pointer;
    list-style: none;
  }
  .values summary::-webkit-details-marker {
    display: none;
  }
  .values summary .grow {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .summary-line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .values summary :global(svg) {
    flex: none;
    color: var(--text-2);
    transform: rotate(90deg);
    transition: transform 150ms;
  }
  .values[open] summary :global(svg) {
    transform: rotate(-90deg);
  }
  .values-body {
    padding: 0 20px 16px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .warn {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    color: var(--over-ink);
    font-size: 15px;
    font-weight: 500;
  }
  .footer {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .ai-actions {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 12px;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 8px;
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
  .estimate ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .estimate li {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 15px;
  }
  .est-head {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-ink);
  }
  .est-head h2 {
    color: var(--text);
  }
  .grow {
    flex: 1;
  }
</style>
