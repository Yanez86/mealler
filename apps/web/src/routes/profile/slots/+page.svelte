<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { ALL_DAYS, dayBit, type Slot } from '@mealler/shared';
  import { del, get, patch, post, put } from '$lib/api';
  import { errorMessage, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let slots = $state<Slot[]>([]);
  let error = $state('');
  let savedId = $state<number | null>(null);
  let draft = $state({ name: '', time: '12:00', days: ALL_DAYS });

  const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
  const delays = [0, 15, 30, 45, 60, 90, 120];

  onMount(load);

  async function load() {
    try {
      slots = await get<Slot[]>('/slots');
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function toggleDay(mask: number, day: number): number {
    return mask ^ dayBit(day);
  }

  async function save(slot: Slot) {
    error = '';
    if (!slot.days) return (error = t('slots.noDays'));
    try {
      await patch(`/slots/${slot.id}`, {
        name: slot.name,
        time: slot.time,
        days: slot.days,
        reminderEnabled: slot.reminderEnabled,
        reminderDelayMin: Number(slot.reminderDelayMin)
      });
      savedId = slot.id;
      setTimeout(() => (savedId = null), 2000);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function archive(slot: Slot) {
    if (!confirm(t('slots.archiveConfirm'))) return;
    try {
      await del(`/slots/${slot.id}`);
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    const ids = slots.map((s) => s.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      slots = await put<Slot[]>('/slots/order', { ids });
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function create(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    if (!draft.days) return (error = t('slots.noDays'));
    try {
      await post('/slots', draft);
      draft = { name: '', time: '12:00', days: ALL_DAYS };
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>{t('slots.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('slots.title')}>
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  <p class="muted">{t('slots.intro')}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#each slots as slot, i (slot.id)}
    <form class="card stack" onsubmit={(e) => (e.preventDefault(), save(slot))}>
      <div class="row">
        <div class="field grow">
          <label for="name-{slot.id}">{t('slots.name')}</label>
          <input id="name-{slot.id}" required maxlength="100" bind:value={slot.name} />
        </div>
        <div class="field">
          <label for="time-{slot.id}">{t('slots.time')}</label>
          <input id="time-{slot.id}" type="time" required bind:value={slot.time} />
        </div>
      </div>
      <fieldset class="days">
        <legend class="label">{t('slots.days')}</legend>
        <div class="day-row">
          {#each weekdays as d (d)}
            <button
              type="button"
              class="chip day"
              aria-pressed={(slot.days & dayBit(d)) !== 0}
              aria-label={t(`weekday.long.${d}`)}
              onclick={() => (slot.days = toggleDay(slot.days, d))}>{t(`weekday.short.${d}`)}</button>
          {/each}
        </div>
      </fieldset>
      <div class="row">
        <label class="check grow">
          <input type="checkbox" bind:checked={slot.reminderEnabled} />
          <span>{t('slots.reminder')}</span>
        </label>
        <div class="field">
          <label class="visually-hidden" for="delay-{slot.id}">{t('slots.delay')}</label>
          <select id="delay-{slot.id}" disabled={!slot.reminderEnabled} bind:value={slot.reminderDelayMin}>
            {#each delays as d (d)}
              <option value={d}>{d === 0 ? t('slots.delayNow') : t('slots.delayMin', { n: d })}</option>
            {/each}
          </select>
        </div>
      </div>
      <div class="actions">
        <button class="btn btn-primary" type="submit">{savedId === slot.id ? t('common.saved') : t('common.save')}</button>
        <button class="icon-btn" type="button" aria-label={t('slots.moveUp')} disabled={i === 0} onclick={() => move(i, -1)}><Icon name="up" /></button>
        <button class="icon-btn" type="button" aria-label={t('slots.moveDown')} disabled={i === slots.length - 1} onclick={() => move(i, 1)}><Icon name="down" /></button>
        <button class="btn btn-ghost" type="button" onclick={() => archive(slot)}>{t('slots.archive')}</button>
      </div>
    </form>
  {/each}

  <form class="card stack" onsubmit={create}>
    <h2 class="section-title">{t('slots.new')}</h2>
    <div class="row">
      <div class="field grow">
        <label for="new-name">{t('slots.name')}</label>
        <input id="new-name" required maxlength="100" bind:value={draft.name} />
      </div>
      <div class="field">
        <label for="new-time">{t('slots.time')}</label>
        <input id="new-time" type="time" required bind:value={draft.time} />
      </div>
    </div>
    <fieldset class="days">
      <legend class="label">{t('slots.days')}</legend>
      <div class="day-row">
        {#each weekdays as d (d)}
          <button
            type="button"
            class="chip day"
            aria-pressed={(draft.days & dayBit(d)) !== 0}
            aria-label={t(`weekday.long.${d}`)}
            onclick={() => (draft.days = toggleDay(draft.days, d))}>{t(`weekday.short.${d}`)}</button>
        {/each}
      </div>
    </fieldset>
    <button class="btn btn-primary" type="submit"><Icon name="plus" size={20} />{t('slots.new')}</button>
  </form>
</main>

<style>
  .row {
    display: flex;
    gap: 12px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .days {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }
  .days legend {
    padding: 0;
    margin-bottom: 8px;
  }
  .day-row {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    gap: 4px;
  }
  .day {
    justify-content: center;
    padding: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  .check input {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .icon-btn:disabled {
    opacity: 0.4;
  }
</style>
