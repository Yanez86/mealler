<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import {
    NUTRIENTS,
    addDays,
    displayQuantity,
    isIsoDate,
    mealCategory,
    sumValues,
    thresholdStatus,
    thresholdTone,
    todayIn,
    type DayResponse,
    type Entry,
    type Nutrient,
    type NutrientSummary,
    type ThresholdStatus
  } from '@mealler/shared';
  import { beacon, del, get, post, put } from '$lib/api';
  import type { AiStatus } from '@mealler/shared';
  import { app, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import { fill } from '$lib/fill';
  import CalendarPopup from '$lib/CalendarPopup.svelte';
  import Estimating from '$lib/Estimating.svelte';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import Swipeable from '$lib/Swipeable.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import { net, pendingFor } from '$lib/offline.svelte';

  const timezone = $derived(app.user?.timezone ?? 'UTC');
  const today = $derived(todayIn(timezone));
  const date = $derived.by(() => {
    const d = page.url.searchParams.get('d');
    return d && isIsoDate(d) ? d : today;
  });

  let loadedDay = $state<DayResponse | null>(null);
  let error = $state('');

  // ---------- Swipe to delete, with undo ----------
  // Deleted entries disappear at once; the server is asked only when the undo bar goes away.
  interface PendingDelete {
    ids: number[];
    message: string;
    timer: ReturnType<typeof setTimeout>;
  }
  let pendingDelete = $state<PendingDelete | null>(null);

  /** The day without some entries, with slot totals and the summary computed again. */
  function withoutEntries(d: DayResponse, ids: number[]): DayResponse {
    const gone = new Set(ids);
    const slots = d.slots.map((s) => {
      const entries = s.entries.filter((e) => !gone.has(e.id));
      return entries.length === s.entries.length ? s : { ...s, entries, totals: sumValues(entries) };
    });
    const totals = sumValues(slots.flatMap((s) => s.entries));
    const summary = { ...d.summary };
    for (const n of NUTRIENTS) {
      const { min, max } = d.summary[n];
      summary[n] = { value: totals[n], min, max, status: thresholdStatus(totals[n], min, max) };
    }
    return { ...d, slots, summary };
  }

  const day = $derived(loadedDay && pendingDelete ? withoutEntries(loadedDay, pendingDelete.ids) : loadedDay);

  function removeEntries(ids: number[], message: string) {
    if (!ids.length) return;
    void commitDelete();
    pendingDelete = { ids, message, timer: setTimeout(commitDelete, 5000) };
  }

  async function commitDelete() {
    const p = pendingDelete;
    if (!p) return;
    clearTimeout(p.timer);
    if (loadedDay) loadedDay = withoutEntries(loadedDay, p.ids);
    pendingDelete = null;
    try {
      await post('/entries/delete', { ids: p.ids });
    } catch (e) {
      error = errorMessage(e);
      // Not deleted (e.g. offline): show the entries again.
      loadedDay = await get<DayResponse>(`/day/${date}`).catch(() => loadedDay);
    }
  }

  function undoDelete() {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timer);
    pendingDelete = null;
  }

  // Leaving the page or the app confirms the deletion.
  onDestroy(() => void commitDelete());
  $effect(() => {
    const hide = () => {
      const p = pendingDelete;
      if (document.visibilityState !== 'hidden' || !p) return;
      clearTimeout(p.timer);
      if (loadedDay) loadedDay = withoutEntries(loadedDay, p.ids);
      pendingDelete = null;
      beacon('/entries/delete', { ids: p.ids });
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  });

  function clearSlot(name: string, entries: Entry[]) {
    removeEntries(
      entries.map((e) => e.id),
      t('swipe.slotCleared', { slot: name })
    );
  }

  const units = $derived(app.user?.units ?? 'metric');
  function entryMeta(entry: Entry): string {
    return [
      displayQuantity(entry.quantity, units, app.locale),
      entry.kcal != null ? `${formatNumber(entry.kcal)} kcal` : null
    ]
      .filter(Boolean)
      .join(' · ');
  }

  $effect(() => {
    const d = date;
    void net.pending;
    error = '';
    get<DayResponse>(`/day/${d}`)
      .then((res) => {
        if (d === date) loadedDay = res;
      })
      .catch((e) => (error = errorMessage(e)));
  });

  // While Claude is estimating entries in the background, refresh the day every few seconds.
  const hasPending = $derived(!!day?.slots.some((s) => s.entries.some((e) => e.calcStatus === 'pending')));
  $effect(() => {
    if (!hasPending) return;
    const d = date;
    const timer = setInterval(async () => {
      try {
        const res = await get<DayResponse>(`/day/${d}`);
        if (d === date) loadedDay = res;
      } catch {
        // offline: try again on the next tick
      }
    }, 4000);
    return () => clearInterval(timer);
  });

  let ai = $state<AiStatus | null>(null);
  let queuedMessage = $state('');
  $effect(() => {
    get<AiStatus>('/ai/status').then((s) => (ai = s)).catch(() => {});
  });
  const withoutValues = $derived(
    day
      ? day.slots.flatMap((s) => s.entries).filter(
          (e) => e.calcStatus !== 'pending' && [e.kcal, e.protein, e.carbs, e.fat, e.fiber].every((v) => v == null)
        ).length
      : 0
  );
  async function calculateAll() {
    try {
      const { queued } = await post<{ queued: number }>(`/day/${date}/calculate`);
      queuedMessage = t('day.calculating', { n: queued });
      loadedDay = await get<DayResponse>(`/day/${date}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  // Another day slides in from the side it comes from (next day from the right).
  let dayDir = $state(0);
  const motion = typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function go(d: string) {
    dayDir = d > date ? 1 : d < date ? -1 : 0;
    goto(d === today ? '/' : `/?d=${d}`, { keepFocus: true, noScroll: true });
  }

  let showCalendar = $state(false);
  function pickDay(d: string) {
    showCalendar = false;
    if (d !== date) go(d);
  }

  // ---------- Skipped meals and slots for this day only ----------

  async function reload() {
    loadedDay = await get<DayResponse>(`/day/${date}`).catch(() => loadedDay);
  }

  async function setSkip(slotId: number, skip: boolean) {
    error = '';
    // Shown at once; the server confirms.
    if (loadedDay) {
      loadedDay = { ...loadedDay, slots: loadedDay.slots.map((s) => (s.slot.id === slotId ? { ...s, skipped: skip } : s)) };
    }
    try {
      if (skip) await put(`/day/${date}/skip/${slotId}`, {});
      else await del(`/day/${date}/skip/${slotId}`);
    } catch (e) {
      error = errorMessage(e);
    }
    await reload();
  }

  let addingSlot = $state(false);
  let extraName = $state('');
  let extraTime = $state('');

  function openAddSlot() {
    extraName = '';
    extraTime = nowTime;
    addingSlot = true;
    requestAnimationFrame(() => document.getElementById('extra-name')?.focus());
  }

  async function addExtraSlot(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      await post('/slots', { name: extraName.trim(), time: extraTime, date });
      addingSlot = false;
      await reload();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function removeExtraSlot(slotId: number) {
    error = '';
    try {
      await del(`/slots/${slotId}`);
    } catch (e) {
      error = errorMessage(e);
    }
    await reload();
  }

  const nowTime = $derived.by(() => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
    return parts;
  });

  const short: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
  const title = $derived(date === today ? t('day.today') : formatDate(date, short));
  const subtitle = $derived(
    date === today ? formatDate(date, short) : formatDate(date, { year: 'numeric' })
  );

  const macros: Nutrient[] = ['protein', 'carbs', 'fat', 'fiber'];

  function target(s: NutrientSummary, unit: string): string {
    const f = (n: number) => `${formatNumber(n)} ${unit}`;
    if (s.min != null && s.max != null) return t('day.range', { min: formatNumber(s.min), max: f(s.max) });
    if (s.min != null) return t('day.min', { n: f(s.min) });
    if (s.max != null) return t('day.max', { n: f(s.max) });
    return t('day.noThreshold');
  }

  const tone = (s: NutrientSummary) => thresholdTone(s.value, s.min, s.max);

  function percent(s: NutrientSummary): number {
    const ref = s.max ?? s.min;
    if (!ref) return 0;
    return Math.min(100, Math.round((s.value / ref) * 100));
  }

  const statusIcon: Record<ThresholdStatus, 'down' | 'check' | 'up' | 'minus'> = {
    under: 'down',
    ok: 'check',
    over: 'up',
    none: 'minus'
  };

  // Skipped meals count as filled.
  const filled = $derived(day ? day.slots.filter((s) => s.entries.length > 0 || s.skipped).length : 0);

  function isDue(slotTime: string): boolean {
    return date < today || (date === today && slotTime <= nowTime);
  }
</script>

<svelte:head><title>{title} · Mealler</title></svelte:head>

<main class="page">
  <TopBar {title} {subtitle} ontitle={() => (showCalendar = true)} titleLabel={t('calendar.open')}>
    {#snippet actions()}
      <button class="icon-btn" type="button" aria-label={t('day.prev')} onclick={() => go(addDays(date, -1))}>
        <Icon name="left" />
      </button>
      <button class="icon-btn" type="button" aria-label={t('day.next')} onclick={() => go(addDays(date, 1))}>
        <Icon name="right" />
      </button>
    {/snippet}
  </TopBar>

  {#if date !== today}
    <p style="margin-bottom: 12px"><a href="/">{t('day.goToday')}</a></p>
  {/if}

  {#if page.url.searchParams.has('queued') && !net.online}
    <p class="notice" role="status">{t('offline.queued')}</p>
  {:else if !net.online}
    <p class="notice" role="status">{t('offline.cached')}</p>
  {/if}
  {#if net.pending > 0 && pendingFor(date) > 0}
    <p class="notice" role="status">{t('offline.pending', { n: pendingFor(date) })}</p>
  {/if}

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if day}
    {@const kcal = day.summary.kcal}
    {#key day.date}
    <div class="day-body" in:fly={{ x: dayDir * 48, duration: motion ? 260 : 0, easing: cubicOut, opacity: 0 }}>
    <section class="card summary" aria-label={t('day.summary')}>
      <div class="kcal">
        <p><span class="big">{formatNumber(kcal.value)}</span> <span class="muted unit">kcal</span></p>
        {#if kcal.max != null}
          <p class="muted small right">
            {kcal.value <= kcal.max
              ? t('day.kcalLeft', { n: formatNumber(kcal.max - kcal.value) })
              : t('day.kcalOver', { n: formatNumber(kcal.value - kcal.max) })}<br />
            {kcal.min != null
              ? t('day.range', { min: formatNumber(kcal.min), max: formatNumber(kcal.max) })
              : t('day.maxOf', { n: formatNumber(kcal.max) })}
          </p>
        {:else if kcal.min != null}
          <p class="muted small right">{t('day.min', { n: `${formatNumber(kcal.min)} kcal` })}</p>
        {/if}
      </div>
      {#if kcal.max != null || kcal.min != null}
        <div class="bar thick"><span class="tone-{tone(kcal)}" use:fill={percent(kcal)}></span></div>
        {#if kcal.status !== 'none' && kcal.status !== 'ok'}
          <p class="status tone-ink-{tone(kcal)}"><Icon name={statusIcon[kcal.status]} size={14} stroke={2.5} />{t(`day.status.${kcal.status}`)}</p>
        {/if}
      {/if}

      <div class="macros">
        {#each macros as n (n)}
          {@const s = day.summary[n]}
          <div class="macro">
            <div class="macro-head">
              <span class="muted name">{t(`nutrient.${n}`)}</span>
              <span class="muted small target">{target(s, 'g')}</span>
            </div>
            <span class="value">{formatNumber(s.value, 1)} g</span>
            <div class="bar"><span class="tone-{tone(s)}" use:fill={percent(s)}></span></div>
            <span class="status tone-ink-{tone(s)}" class:quiet={s.status === 'none'}><Icon name={statusIcon[s.status]} size={14} stroke={2.5} />{t(`day.status.${s.status}`)}</span>
          </div>
        {/each}
      </div>
    </section>

    {#if withoutValues > 0 && ai?.enabled && !ai.capReached && !ai.limitReached}
      <button class="btn btn-block calc-all" type="button" onclick={calculateAll}>
        <Icon name="sparkle" size={20} />{t('day.calculateAll', { n: withoutValues })}
      </button>
    {/if}
    {#if queuedMessage}<p class="notice" role="status">{queuedMessage}</p>{/if}

    <section class="meals" aria-labelledby="meals-title">
      <div class="meals-head">
        <h2 id="meals-title" class="section-title">{t('day.meals')}</h2>
        {#if day.slots.length}
          <span class="muted small">{t('day.filled', { n: filled, total: day.slots.length })}</span>
        {/if}
      </div>

      {#if !day.slots.length}
        <p class="notice">{t('day.noSlots')}</p>
      {/if}

      {#each day.slots as { slot, entries, totals, skipped } (slot.id)}
        {@const empty = entries.length === 0}
        {@const due = empty && !skipped && isDue(slot.time)}
        {@const extra = slot.date != null}
        <Swipeable
          label={!empty
            ? t('swipe.clearSlot', { slot: slot.name })
            : skipped
              ? t('swipe.unskip', { slot: slot.name })
              : t('swipe.removeSlot', { slot: slot.name })}
          disabled={empty && !skipped && !extra}
          radius="16px"
          ondelete={() => (!empty ? clearSlot(slot.name, entries) : skipped ? setSkip(slot.id, false) : removeExtraSlot(slot.id))}>
        <div class="slot card" class:due class:skipped>
          <div class="slot-main">
            <div class="slot-head">
              <span class="slot-name">{slot.time} · {slot.name}{#if extra}<span class="extra">{t('day.extra')}</span>{/if}</span>
              {#if !empty}<span class="slot-kcal">{formatNumber(totals.kcal)} kcal</span>{/if}
            </div>
            {#if skipped}
              <button class="skipped-pill" type="button" aria-label={t('day.unskipLabel', { slot: slot.name })} onclick={() => setSkip(slot.id, false)}>
                <Icon name="skip" size={16} stroke={2.2} />{t('day.skipped')}
              </button>
            {:else if empty}
              <span class="empty-line">
                <span class="muted">{t('day.empty')}</span>
                {#if due}
                  <button class="skip" type="button" aria-label={t('day.skipLabel', { slot: slot.name })} onclick={() => setSkip(slot.id, true)}>{t('day.skip')}</button>
                {/if}
              </span>
            {:else}
              <ul>
                {#each entries as entry (entry.id)}
                  {@const meta = entryMeta(entry)}
                  <li>
                    <Swipeable
                      label={t('swipe.deleteEntry', { name: entry.description })}
                      background="var(--surface)"
                      ondelete={() => removeEntries([entry.id], t('swipe.entryDeleted', { name: entry.description }))}>
                    <a href="/add?entry={entry.id}">
                      <FoodIcon category={entry.category ?? mealCategory([entry.description], entry.items)} size={36} />
                      <span class="desc">
                        <span class="name">{entry.description}</span>
                        {#if meta}<span class="meta">{meta}</span>{/if}
                      </span>
                      {#if entry.calcStatus === 'pending'}
                        <span class="claude"><Estimating size={14} /></span>
                      {:else if entry.calcError}
                        <span class="flag"><Icon name="alert" size={14} />{t('ai.failed')}</span>
                      {:else if entry.source === 'claude_ai' || entry.source === 'in_app'}
                        <span class="claude"><Icon name="sparkle" size={12} />{t('day.estimate')}</span>
                      {/if}
                      {#if entry.kcalMismatch}
                        <span class="flag"><Icon name="alert" size={14} />{t('day.mismatch')}</span>
                      {/if}
                    </a>
                    </Swipeable>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
          {#if due}
            <a class="btn btn-primary" href="/add?slot={slot.id}&d={date}"><Icon name="plus" size={20} stroke={2.5} />{t('common.add')}</a>
          {:else}
            <a class="icon-btn plain" href="/add?slot={slot.id}&d={date}" aria-label={t('day.addTo', { slot: slot.name })}>
              <Icon name="plus" />
            </a>
          {/if}
        </div>
        </Swipeable>
      {/each}

      {#if addingSlot}
        <form class="card stack add-slot" onsubmit={addExtraSlot}>
          <p class="help">{t('day.addSlotHelp')}</p>
          <div class="pair">
            <div class="field">
              <label for="extra-name">{t('slots.name')}</label>
              <input id="extra-name" required maxlength="100" bind:value={extraName} />
            </div>
            <div class="field">
              <label for="extra-time">{t('slots.time')}</label>
              <input id="extra-time" type="time" required bind:value={extraTime} />
            </div>
          </div>
          <div class="row">
            <button class="btn btn-primary" type="submit" disabled={!extraName.trim() || !extraTime}>{t('common.add')}</button>
            <button class="btn btn-ghost" type="button" onclick={() => (addingSlot = false)}>{t('common.cancel')}</button>
          </div>
        </form>
      {:else}
        <button class="btn btn-ghost add-slot-btn" type="button" onclick={openAddSlot}><Icon name="plus" size={20} stroke={2.5} />{t('day.addSlot')}</button>
      {/if}
    </section>
    </div>
    {/key}

    {#if pendingDelete}
      <div class="snackbar" role="status">
        <span>{pendingDelete.message}</span>
        <button type="button" onclick={undoDelete}>{t('swipe.undo')}</button>
      </div>
    {/if}
  {:else if !error}
    <p class="muted" role="status">{t('common.loading')}</p>
  {/if}

  {#if showCalendar}
    <CalendarPopup selected={date} {today} onpick={pickDay} onclose={() => (showCalendar = false)} />
  {/if}
</main>

<style>
  .summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .kcal {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 12px;
  }
  .big {
    font-size: 32px;
    font-weight: 700;
    line-height: 36px;
  }
  .unit {
    font-weight: 500;
  }
  .right {
    text-align: right;
  }
  .thick {
    height: 10px;
    border-radius: 5px;
  }
  .macros {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    margin-top: 8px;
  }
  .macro {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .macro-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 6px;
    font-size: 14px;
    font-weight: 500;
    min-width: 0;
  }
  /* One line only: long labels are truncated, never wrapped. */
  .macro-head .name,
  .macro-head .target {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .macro-head .name {
    flex: 0 1 auto;
  }
  .macro-head .target {
    flex: 0 1 auto;
    text-align: right;
  }
  .value {
    font-size: 20px;
    font-weight: 700;
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
  }
  .status.quiet {
    font-weight: 500;
  }
  .calc-all {
    margin-top: 16px;
  }
  .meals {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .meals-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 0 4px;
  }
  .slot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 6px 10px 16px;
    border-radius: 16px;
  }
  .slot.due {
    background: var(--accent-soft);
    border: 2px solid var(--accent);
    padding-right: 12px;
  }
  .slot.due .slot-name {
    color: var(--accent-ink);
  }
  .slot.skipped {
    background: var(--surface-2);
    border-color: transparent;
  }
  .extra {
    margin-left: 8px;
    padding: 1px 8px;
    border-radius: 10px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 600;
  }
  .empty-line {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .skip {
    min-height: 32px;
    padding: 0 10px;
    border: none;
    border-radius: 16px;
    background: transparent;
    color: var(--accent-ink);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .skipped-pill {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 36px;
    margin-top: 2px;
    padding: 0 12px;
    border: 1px solid var(--field);
    border-radius: 18px;
    background: var(--surface);
    color: var(--text-2);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .add-slot-btn {
    align-self: flex-start;
    padding: 0 12px;
  }
  .add-slot .pair {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    gap: 12px;
  }
  .add-slot .row {
    display: flex;
    gap: 8px;
  }
  .slot-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .slot-head {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
  .slot-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--text-2);
  }
  .slot-kcal {
    font-size: 14px;
    font-weight: 600;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  li a {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 48px;
    color: var(--text);
    text-decoration: none;
  }
  .desc {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .desc .name,
  .desc .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .desc .meta {
    font-size: 13px;
    color: var(--text-2);
  }
  .snackbar {
    position: fixed;
    left: 50%;
    bottom: calc(max(12px, env(safe-area-inset-bottom)) + 80px);
    transform: translateX(-50%);
    width: calc(100% - 32px);
    max-width: 528px;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 6px 6px 16px;
    border-radius: 14px;
    background: var(--text);
    color: var(--bg);
    font-size: 15px;
    box-shadow: 0 6px 24px rgb(0 0 0 / 0.2);
    animation: rise 200ms ease-out;
    z-index: 25;
  }
  .snackbar span {
    flex: 1;
    min-width: 0;
  }
  .snackbar button {
    flex: none;
    min-height: 44px;
    padding: 0 14px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translate(-50%, 12px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .snackbar {
      animation: none;
    }
  }
  .claude {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    background: var(--accent-soft);
    color: var(--accent-ink);
  }
  .flag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--over-ink);
  }
</style>
