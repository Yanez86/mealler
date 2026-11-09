<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    isIsoDate,
    kcalMismatch,
    todayIn,
    type Entry,
    type Nutrient,
    type Slot
  } from '@mealler/shared';
  import { del, get, patch, post } from '$lib/api';
  import { app, errorMessage, formatDate, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

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

  const toNumber = (s: string): number | null => {
    const trimmed = s.trim().replace(',', '.');
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const toText = (n: number | null) => (n == null ? '' : String(n).replace('.', app.locale === 'it' ? ',' : '.'));

  const parsed = $derived({
    kcal: toNumber(values.kcal),
    protein: toNumber(values.protein),
    carbs: toNumber(values.carbs),
    fat: toNumber(values.fat),
    fiber: toNumber(values.fiber)
  });
  const mismatch = $derived(kcalMismatch(parsed));

  onMount(async () => {
    try {
      const all = await get<Slot[]>('/slots');
      if (entryId) {
        const entry = await get<Entry>(`/entries/${entryId}`);
        slotId = entry.slotId;
        date = entry.date;
        description = entry.description;
        quantity = entry.quantity ?? '';
        notes = entry.notes ?? '';
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
    } catch (e) {
      error = errorMessage(e);
    }
    loaded = true;
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!slotId) return;
    busy = true;
    error = '';
    const body = { slotId, date, description, quantity: quantity || null, notes: notes || null, ...parsed };
    try {
      if (entryId) await patch(`/entries/${entryId}`, body);
      else await post('/entries', body);
      await goto(date === today ? '/' : `/?d=${date}`);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function remove() {
    if (!entryId || !confirm(t('entry.deleteConfirm'))) return;
    busy = true;
    try {
      await del(`/entries/${entryId}`);
      await goto(date === today ? '/' : `/?d=${date}`);
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
    subtitle={formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}>
    {#snippet actions()}
      <a class="icon-btn" href={date === today ? '/' : `/?d=${date}`} aria-label={t('common.close')}><Icon name="close" /></a>
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

      <div class="field">
        <label for="date">{t('entry.date')}</label>
        <input id="date" type="date" required bind:value={date} />
      </div>

      <div class="field">
        <label for="what">{t('entry.what')}</label>
        <textarea id="what" rows="3" required maxlength="1000" aria-describedby="what-help" bind:value={description}></textarea>
        <p id="what-help" class="help">{t('entry.whatHelp')}</p>
      </div>

      <div class="field">
        <label for="quantity">{t('entry.quantity')} <span class="muted small">({t('common.optional')})</span></label>
        <input id="quantity" maxlength="200" bind:value={quantity} />
      </div>

      <section class="card stack" aria-labelledby="values-title">
        <h2 id="values-title" class="label">{t('entry.values')}</h2>
        <p class="help">{t('entry.valuesHelp')}</p>
        <div class="grid">
          {#each nutrients as n (n.key)}
            <div class="field">
              <label for="v-{n.key}">{t(`nutrient.${n.key}`)} <span class="muted small">({n.unit})</span></label>
              <input id="v-{n.key}" inputmode="decimal" autocomplete="off" bind:value={values[n.key]} />
            </div>
          {/each}
        </div>
        {#if mismatch}
          <p class="warn" role="status"><Icon name="alert" size={18} />{t('entry.mismatch')}</p>
        {/if}
      </section>

      <div class="field">
        <label for="notes">{t('entry.notes')} <span class="muted small">({t('common.optional')})</span></label>
        <textarea id="notes" rows="2" maxlength="2000" bind:value={notes}></textarea>
      </div>

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="footer">
        <button class="btn btn-primary btn-block" type="submit" disabled={busy || !slotId}>{t('entry.save')}</button>
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
</style>
