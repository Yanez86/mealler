<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { onDestroy, onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fly } from 'svelte/transition';
  import {
    NUTRIENTS,
    addDays,
    dayStatus,
    displayQuantity,
    isIsoDate,
    mealCategory,
    sumValues,
    todayIn,
    type DayResponse,
    type DayStatus,
    type Entry,
    type Nutrient,
    type NutrientSummary,
    type Untracked,
    type UntrackedSize,
    type WaterDay,
    UNTRACKED_SIZES
  } from '@mealler/shared';
  import { beacon, del, get, post, put } from '$lib/api';
  import type { AiStatus } from '@mealler/shared';
  import { app, clock, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import { fill } from '$lib/fill';
  import CalendarPopup from '$lib/CalendarPopup.svelte';
  import Estimating from '$lib/Estimating.svelte';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import Swipeable, { type SwipeAction } from '$lib/Swipeable.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import UntrackedSheet from '$lib/UntrackedSheet.svelte';
  import WaterCard from '$lib/WaterCard.svelte';
  import NutrientIcon from '$lib/NutrientIcon.svelte';
  import { waterText } from '$lib/water';
  import { net, pendingFor } from '$lib/offline.svelte';

  const timezone = $derived(app.user?.timezone ?? 'UTC');
  const today = $derived(todayIn(timezone, new Date(clock.now)));
  const date = $derived.by(() => {
    const d = page.url.searchParams.get('d');
    return d && isIsoDate(d) ? d : today;
  });

  let loadedDay = $state<DayResponse | null>(null);
  let error = $state('');

  // ---------- "Bevi un bicchiere" ----------
  // The Android shortcut opens /?water=add: one glass for today, then the plain diary with a note.
  let waterAdded = $state('');
  onMount(async () => {
    const user = app.user;
    if (page.url.searchParams.get('water') !== 'add' || !user) return;
    const day = today;
    await goto('/', { replaceState: true, keepFocus: true, noScroll: true });
    try {
      const res = await post<WaterDay>('/water', { date: day, ml: user.waterGlassMl });
      waterAdded = t('water.addedShortcut', { amount: waterText(res.ml), goal: waterText(user.waterGoalMl) });
      const fresh = await get<DayResponse>(`/day/${day}`);
      if (date === day) loadedDay = fresh;
    } catch (e) {
      error = errorMessage(e);
    }
  });

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
      summary[n] = { value: totals[n], min, max, status: dayStatus(totals[n], min, max, d.untracked) };
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
    // Back in the foreground: a meal logged from claude.ai or another device shows up.
    void clock.resumed;
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
  // A second tap while a request is on its way does nothing (estimates, new slot).
  let working = false;
  async function calculateAll() {
    if (working) return;
    working = true;
    try {
      const { queued } = await post<{ queued: number }>(`/day/${date}/calculate`);
      queuedMessage = t('day.calculating', { n: queued });
      loadedDay = await get<DayResponse>(`/day/${date}`);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      working = false;
    }
  }

  // Another day slides in from the side it comes from (next day from the right).
  let dayDir = $state(0);
  const motion = typeof matchMedia === 'undefined' || !matchMedia('(prefers-reduced-motion: reduce)').matches;

  function go(d: string) {
    dayDir = d > date ? 1 : d < date ? -1 : 0;
    goto(d === today ? '/' : `/?d=${d}`, { keepFocus: true, noScroll: true });
  }

  // ---------- Swipe to change day ----------
  // A clear sideways swipe on the page shows the next day (to the left) or the previous one (to the
  // right), like the arrows. Meals and entries that swipe on their own (to the trash) keep their gesture:
  // their pointerdown does not reach the page. Touch only: with a mouse the arrows are at hand.
  const DAY_SWIPE = 60;
  let daySwipe: { id: number; x: number; y: number; vertical: boolean } | null = null;
  let swallowClick = false;

  function daySwipeDown(e: PointerEvent) {
    daySwipe = null;
    if (!e.isPrimary || e.pointerType === 'mouse' || showCalendar) return;
    if ((e.target as Element).closest('input, textarea, select, [role="dialog"], .snackbar')) return;
    daySwipe = { id: e.pointerId, x: e.clientX, y: e.clientY, vertical: false };
  }

  function daySwipeMove(e: PointerEvent) {
    if (!daySwipe || e.pointerId !== daySwipe.id) return;
    const dy = Math.abs(e.clientY - daySwipe.y);
    if (dy > 12 && dy > Math.abs(e.clientX - daySwipe.x)) daySwipe.vertical = true;
  }

  function daySwipeUp(e: PointerEvent) {
    const s = daySwipe;
    if (!s || e.pointerId !== s.id) return;
    daySwipe = null;
    if (s.vertical) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < DAY_SWIPE || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    // The swipe may have started on a link or button: it is not a tap on it.
    swallowClick = true;
    setTimeout(() => (swallowClick = false), 400);
    go(addDays(date, dx < 0 ? 1 : -1));
  }

  function daySwipeClick(e: MouseEvent) {
    if (!swallowClick) return;
    e.preventDefault();
    e.stopPropagation();
    swallowClick = false;
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

  // ---------- Meals off the diary ----------
  // Eaten but not logged, or not all of it: the meal counts as filled, the day's totals stay partial.
  let untrackedFor = $state<{ id: number; name: string; current: Untracked | null } | null>(null);

  // A short message at the bottom, with "Undo" when the change can be taken back.
  let notice = $state<{ message: string; undo?: () => void } | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(noticeTimer));

  function showNotice(message: string, undo?: () => void) {
    clearTimeout(noticeTimer);
    notice = { message, undo };
    noticeTimer = setTimeout(() => (notice = null), 5000);
  }

  function undoNotice() {
    const undo = notice?.undo;
    clearTimeout(noticeTimer);
    notice = null;
    undo?.();
  }

  // The swipe on an empty meal is explained once, until it is first used.
  const HINT_KEY = 'mealler-swipe-hint';
  let hintDone = $state(
    (() => {
      try {
        return localStorage.getItem(HINT_KEY) === '1';
      } catch {
        return false;
      }
    })()
  );
  function swipeUsed() {
    hintDone = true;
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // private mode: the hint comes back next time
    }
  }

  async function skipMeal(id: number, name: string) {
    swipeUsed();
    await setSkip(id, true);
    showNotice(t('day.skippedToast', { slot: name }), () => setSkip(id, false));
  }

  // Marked at once; how much and a note can follow with a tap on the meal.
  async function untrackMeal(id: number, name: string) {
    swipeUsed();
    await setUntracked(id, { size: null, note: null });
    showNotice(t('untracked.marked', { slot: name }), () => setUntracked(id, null));
  }

  /** What the swipe on an empty meal offers: skip it (or remove a meal added for this day only), or off the diary. */
  function emptyActions(id: number, name: string, extra: boolean): SwipeAction[] {
    const first: SwipeAction = extra
      ? { label: t('swipe.removeSlot', { slot: name }), text: t('common.delete'), icon: 'trash', tone: 'danger', run: () => removeExtraSlot(id) }
      : { label: t('day.skipLabel', { slot: name }), text: t('day.skip'), icon: 'skip', tone: 'neutral', run: () => skipMeal(id, name) };
    return [
      first,
      { label: t('day.untrackLabel', { slot: name }), text: t('day.untrack'), icon: 'unseen', tone: 'accent', run: () => untrackMeal(id, name) }
    ];
  }

  function untrackedMeta(u: Untracked): string {
    return [u.size ? t(`untracked.size.${u.size}`) : null, u.note].filter(Boolean).join(' · ') || t('untracked.tapToSay');
  }

  const sizeRank = (size: UntrackedSize) => UNTRACKED_SIZES.indexOf(size);

  function openUntracked(id: number, name: string, current: Untracked | null) {
    untrackedFor = { id, name, current };
  }

  /** The day as it will be once the server agrees: the mark set or removed on one slot. */
  function withUntracked(d: DayResponse, slotId: number, value: Untracked | null): DayResponse {
    const slots = d.slots.map((s) => (s.slot.id === slotId ? { ...s, untracked: value, skipped: false } : s));
    const untracked = slots.some((s) => s.untracked);
    const summary = { ...d.summary };
    for (const n of NUTRIENTS) {
      const { value: v, min, max } = d.summary[n];
      summary[n] = { ...d.summary[n], status: dayStatus(v, min, max, untracked) };
    }
    return { ...d, slots, summary, untracked };
  }

  async function setUntracked(slotId: number, value: Untracked | null) {
    error = '';
    untrackedFor = null;
    if (loadedDay) loadedDay = withUntracked(loadedDay, slotId, value);
    try {
      if (value) {
        await put(`/day/${date}/untracked/${slotId}`, value);
      } else {
        await del(`/day/${date}/untracked/${slotId}`);
      }
    } catch (e) {
      error = errorMessage(e);
    }
    await reload();
  }

  // From the meal page ("Not logging all of it?"): /?d=...&untracked=<slot> opens the mark for that meal.
  $effect(() => {
    const asked = Number(page.url.searchParams.get('untracked'));
    if (!asked || !day || day.date !== date) return;
    const found = day.slots.find((s) => s.slot.id === asked);
    goto(date === today ? '/' : `/?d=${date}`, { replaceState: true, keepFocus: true, noScroll: true });
    if (found) openUntracked(found.slot.id, found.slot.name, found.untracked);
  });

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
    if (working) return;
    working = true;
    error = '';
    try {
      await post('/slots', { name: extraName.trim(), time: extraTime, date });
      addingSlot = false;
      await reload();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      working = false;
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
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(clock.now));
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

  function percent(s: NutrientSummary): number {
    const ref = s.max ?? s.min;
    if (!ref) return 0;
    return Math.min(100, Math.round((s.value / ref) * 100));
  }

  const statusIcon: Record<DayStatus, 'down' | 'check' | 'up' | 'minus' | 'unseen'> = {
    under: 'down',
    ok: 'check',
    over: 'up',
    none: 'minus',
    unknown: 'unseen'
  };

  // Skipped meals and meals off the diary count as filled.
  const filled = $derived(day ? day.slots.filter((s) => s.entries.length > 0 || s.skipped || s.untracked).length : 0);

  function isDue(slotTime: string): boolean {
    return date < today || (date === today && slotTime <= nowTime);
  }
</script>

<svelte:head><title>{title} · Mealler</title></svelte:head>

<main
  class="page day-page"
  onpointerdown={daySwipeDown}
  onpointermove={daySwipeMove}
  onpointerup={daySwipeUp}
  onpointercancel={() => (daySwipe = null)}
  onclickcapture={daySwipeClick}>
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


  {#if page.url.searchParams.has('queued') && !net.online}
    <p class="notice" role="status">{t('offline.queued')}</p>
  {:else if !net.online}
    <p class="notice" role="status">{t('offline.cached')}</p>
  {/if}
  {#if net.pending > 0 && pendingFor(date) > 0}
    <p class="notice" role="status">{t('offline.pending', { n: pendingFor(date) })}</p>
  {/if}

  {#if net.rejected.length}
    <p class="error" role="alert">
      {t('offline.rejected', { names: net.rejected.join(', ') })}
      <button class="btn btn-ghost" type="button" onclick={() => (net.rejected = [])}>{t('common.close')}</button>
    </p>
  {/if}

  {#if waterAdded}
    <p class="notice" role="status">{waterAdded}</p>
  {/if}
  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if day}
    {@const kcal = day.summary.kcal}
    {#key day.date}
    <!-- While another day is loading, the one still on screen cannot be touched: its "+" would add to the wrong date. -->
    <div class="day-body" class:stale={day.date !== date} inert={day.date !== date} in:fly={{ x: dayDir * 48, duration: motion ? 260 : 0, easing: cubicOut, opacity: 0 }}>
    <section class="card summary" aria-label={t('day.summary')}>
      <div class="kcal">
        <p class="kcal-total">
          <NutrientIcon nutrient="kcal" size={30} />
          {#if day.untracked}<span class="muted at-least">{t('day.atLeast')}</span>{/if}
          <span class="big">{formatNumber(kcal.value)}</span> <span class="muted unit">kcal</span>
        </p>
        {#if kcal.max != null}
          <p class="muted small right">
            {#if kcal.value > kcal.max}
              {t('day.kcalOver', { n: formatNumber(kcal.value - kcal.max) })}<br />
            {:else if !day.untracked}
              {t('day.kcalLeft', { n: formatNumber(kcal.max - kcal.value) })}<br />
            {/if}
            {kcal.min != null
              ? t('day.range', { min: formatNumber(kcal.min), max: formatNumber(kcal.max) })
              : t('day.maxOf', { n: formatNumber(kcal.max) })}
          </p>
        {:else if kcal.min != null}
          <p class="muted small right">{t('day.min', { n: `${formatNumber(kcal.min)} kcal` })}</p>
        {/if}
      </div>
      {#if kcal.max != null || kcal.min != null}
        <div class="bar thick"><span class="status-{kcal.status}" use:fill={percent(kcal)}></span></div>
        {#if kcal.status !== 'none' && kcal.status !== 'ok'}
          <p class="status status-ink-{kcal.status}"><Icon name={statusIcon[kcal.status]} size={14} stroke={2.5} />{t(`day.status.${kcal.status}`)}</p>
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
            <span class="value"><NutrientIcon nutrient={n} size={22} />{formatNumber(s.value, 1)} g</span>
            <div class="bar"><span class="status-{s.status}" use:fill={percent(s)}></span></div>
            <span class="status status-ink-{s.status}" class:quiet={s.status === 'none'}><Icon name={statusIcon[s.status]} size={14} stroke={2.5} />{t(`day.status.${s.status}`)}</span>
          </div>
        {/each}
      </div>
      {#if day.untracked}
        <p class="untracked-note"><Icon name="unseen" size={18} />{t('day.untrackedNotice')}</p>
      {/if}
    </section>

    {#if withoutValues > 0 && ai?.enabled && !ai.capReached && !ai.limitReached}
      <button class="btn btn-block calc-all" type="button" onclick={calculateAll}>
        <Icon name="sparkle" size={20} />{t('day.calculateAll', { n: withoutValues })}
      </button>
    {/if}
    {#if withoutValues > 0 && ai?.enabled && (ai.capReached || ai.limitReached)}
      <p class="notice">{t(ai.capReached ? 'ai.capReached' : 'ai.limitReached')}</p>
    {/if}
    {#if queuedMessage}<p class="notice" role="status">{queuedMessage}</p>{/if}

    {#if app.user?.waterEnabled}
      <div class="water-slot">
        <WaterCard
          date={day.date}
          ml={day.water}
          goal={app.user.waterGoalMl}
          glass={app.user.waterGlassMl}
          onchange={(ml) => {
            if (loadedDay && loadedDay.date === day.date) loadedDay.water = ml;
          }} />
      </div>
    {/if}

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

      {#snippet meter(size: UntrackedSize | null)}
        {#if size}
          <span class="meter" aria-hidden="true">
            {#each UNTRACKED_SIZES as s, i (s)}<span class:on={i <= sizeRank(size)} style:height="{8 + i * 4}px"></span>{/each}
          </span>
        {/if}
      {/snippet}

      {#snippet untrackedRow(id: number, name: string, u: Untracked, rest: boolean)}
        <button class="state-row" class:rest type="button" onclick={() => openUntracked(id, name, u)}>
          <span class="badge"><Icon name="unseen" size={18} stroke={2.2} /></span>
          <span class="state-text">
            <span class="state-name">{rest ? t('day.untrackedRest') : t('day.untracked')}</span>
            <span class="state-meta">{untrackedMeta(u)}</span>
          </span>
          {@render meter(u.size)}
        </button>
      {/snippet}

      {#each day.slots as { slot, entries, totals, skipped, untracked } (slot.id)}
        {@const empty = entries.length === 0}
        {@const free = empty && !skipped && !untracked}
        {@const due = free && isDue(slot.time)}
        {@const extra = slot.date != null}
        <Swipeable
          label={!empty
            ? t('swipe.clearSlot', { slot: slot.name })
            : skipped
              ? t('swipe.unskip', { slot: slot.name })
              : t('swipe.untracked', { slot: slot.name })}
          actions={free ? emptyActions(slot.id, slot.name, extra) : undefined}
          radius="16px"
          ondelete={() =>
            !empty ? clearSlot(slot.name, entries) : skipped ? setSkip(slot.id, false) : setUntracked(slot.id, null)}>
        <div class="slot card" class:due class:skipped class:marked={empty && !!untracked}>
          <div class="slot-main">
            <div class="slot-head">
              <span class="slot-name">{slot.time} · {slot.name}{#if extra}<span class="extra">{t('day.extra')}</span>{/if}</span>
              {#if !empty}<span class="slot-kcal">{untracked ? t('day.atLeastKcal', { n: formatNumber(totals.kcal) }) : `${formatNumber(totals.kcal)} kcal`}</span>{/if}
            </div>
            {#if skipped}
              <button class="state-row" type="button" aria-label={t('day.unskipLabel', { slot: slot.name })} onclick={() => setSkip(slot.id, false)}>
                <span class="badge"><Icon name="skip" size={18} stroke={2.2} /></span>
                <span class="state-text"><span class="state-name muted">{t('day.skipped')}</span></span>
              </button>
            {:else if empty && untracked}
              {@render untrackedRow(slot.id, slot.name, untracked, false)}
            {:else if empty}
              <span class="empty">{t('day.empty')}</span>
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
              {#if untracked}{@render untrackedRow(slot.id, slot.name, untracked, true)}{/if}
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

      {#if !hintDone && day.slots.some((x) => x.entries.length === 0 && !x.skipped && !x.untracked && isDue(x.slot.time))}
        <p class="swipe-hint"><Icon name="arrowLeft" size={22} stroke={2.2} /><span>{t('day.swipeHint')}</span></p>
      {/if}

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
    {:else if notice}
      <div class="snackbar" class:quiet={!notice.undo} role="status">
        <span>{notice.message}</span>
        {#if notice.undo}<button type="button" onclick={undoNotice}>{t('swipe.undo')}</button>{/if}
      </div>
    {/if}
  {:else if !error}
    <p class="muted" role="status">{t('common.loading')}</p>
  {/if}

  {#if showCalendar}
    <CalendarPopup selected={date} {today} onpick={pickDay} onclose={() => (showCalendar = false)} />
  {/if}

  {#if untrackedFor}
    {@const target = untrackedFor}
    <UntrackedSheet
      slot={target.name}
      current={target.current}
      onsave={async (value) => {
        await setUntracked(target.id, value);
        if (!target.current) showNotice(t('untracked.marked', { slot: target.name }), () => setUntracked(target.id, null));
      }}
      onremove={() => setUntracked(target.id, null)}
      onclose={() => (untrackedFor = null)} />
  {/if}
</main>

<style>
  /* Sideways moves stay with the page (to change day); scrolling and zooming stay with the browser. */
  .day-page {
    touch-action: pan-y pinch-zoom;
  }
  .day-body.stale {
    opacity: 0.5;
  }
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
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 20px;
    font-weight: 700;
  }
  .kcal-total {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .kcal-total :global(.nutrient-icon) {
    align-self: center;
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
  .water-slot {
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
  .slot.marked {
    border: 1.5px dashed var(--field);
  }
  .empty {
    color: var(--text-2);
  }
  /* A skipped meal or one off the diary: icon, name and details in one tappable row. */
  .state-row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 2px 0;
    border: none;
    background: transparent;
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .state-row.rest {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1.5px dashed var(--field);
  }
  .badge {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 18px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    color: var(--text-2);
  }
  .slot.skipped .badge {
    background: var(--surface);
  }
  .state-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  .state-name {
    font-size: 16px;
    font-weight: 600;
  }
  .state-meta {
    font-size: 13px;
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* How much, roughly: four bars, as many dark as the size. */
  .meter {
    flex: none;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    height: 20px;
    padding-right: 4px;
  }
  .meter span {
    width: 5px;
    border-radius: 2px;
    background: var(--surface-2);
  }
  .meter span.on {
    background: var(--text-2);
  }
  .swipe-hint {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text-2);
    font-size: 14px;
  }
  .swipe-hint :global(svg) {
    flex: none;
    color: var(--accent-ink);
  }
  .at-least {
    font-size: 15px;
    font-weight: 500;
  }
  .untracked-note {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
    font-size: 14px;
    color: var(--text-2);
  }
  .untracked-note :global(svg) {
    flex: none;
    margin-top: 1px;
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
  .snackbar.quiet {
    padding: 14px 16px;
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
