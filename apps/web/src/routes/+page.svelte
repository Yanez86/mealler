<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    addDays,
    isIsoDate,
    mealCategory,
    todayIn,
    type DayResponse,
    type Nutrient,
    type NutrientSummary,
    type ThresholdStatus
  } from '@mealler/shared';
  import { get, post } from '$lib/api';
  import type { AiStatus } from '@mealler/shared';
  import { app, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import FoodIcon from '$lib/FoodIcon.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import { net, pendingFor } from '$lib/offline.svelte';

  const timezone = $derived(app.user?.timezone ?? 'UTC');
  const today = $derived(todayIn(timezone));
  const date = $derived.by(() => {
    const d = page.url.searchParams.get('d');
    return d && isIsoDate(d) ? d : today;
  });

  let day = $state<DayResponse | null>(null);
  let error = $state('');

  $effect(() => {
    const d = date;
    void net.pending;
    error = '';
    get<DayResponse>(`/day/${d}`)
      .then((res) => {
        if (d === date) day = res;
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
        if (d === date) day = res;
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
      day = await get<DayResponse>(`/day/${date}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  function go(d: string) {
    goto(d === today ? '/' : `/?d=${d}`, { keepFocus: true, noScroll: true });
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

  const filled = $derived(day ? day.slots.filter((s) => s.entries.length > 0).length : 0);

  function isDue(slotTime: string): boolean {
    return date < today || (date === today && slotTime <= nowTime);
  }
</script>

<svelte:head><title>{title} · Mealler</title></svelte:head>

<main class="page">
  <TopBar {title} {subtitle}>
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
        <div class="bar thick"><span class="status-{kcal.status}" style="width: {percent(kcal)}%"></span></div>
        {#if kcal.status !== 'none' && kcal.status !== 'ok'}
          <p class="status status-{kcal.status}"><Icon name={statusIcon[kcal.status]} size={14} stroke={2.5} />{t(`day.status.${kcal.status}`)}</p>
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
            <div class="bar"><span class="status-{s.status}" style="width: {percent(s)}%"></span></div>
            <span class="status status-{s.status}"><Icon name={statusIcon[s.status]} size={14} stroke={2.5} />{t(`day.status.${s.status}`)}</span>
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

      {#each day.slots as { slot, entries, totals } (slot.id)}
        {@const empty = entries.length === 0}
        {@const due = empty && isDue(slot.time)}
        <div class="slot card" class:due>
          <div class="slot-main">
            <div class="slot-head">
              <span class="slot-name">{slot.time} · {slot.name}</span>
              {#if !empty}<span class="slot-kcal">{formatNumber(totals.kcal)} kcal</span>{/if}
            </div>
            {#if empty}
              <span class="muted">{t('day.empty')}</span>
            {:else}
              <ul>
                {#each entries as entry (entry.id)}
                  <li>
                    <a href="/add?entry={entry.id}">
                      <FoodIcon category={entry.category ?? mealCategory([entry.description], entry.items)} size={36} />
                      <span class="desc">{entry.description}</span>
                      {#if entry.calcStatus === 'pending'}
                        <span class="claude"><Icon name="sparkle" size={12} />{t('ai.pending')}</span>
                      {:else if entry.calcError}
                        <span class="flag"><Icon name="alert" size={14} />{t('ai.failed')}</span>
                      {:else if entry.source === 'claude_ai' || entry.source === 'in_app'}
                        <span class="claude"><Icon name="sparkle" size={12} />{t('day.estimate')}</span>
                      {/if}
                      {#if entry.kcalMismatch}
                        <span class="flag"><Icon name="alert" size={14} />{t('day.mismatch')}</span>
                      {/if}
                    </a>
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
      {/each}
    </section>
  {:else if !error}
    <p class="muted" role="status">{t('common.loading')}</p>
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
  .bar span.status-ok {
    background: var(--ok);
  }
  .bar span.status-under {
    background: var(--under);
  }
  .bar span.status-over {
    background: var(--over);
  }
  .bar span.status-none {
    background: var(--text-2);
  }
  .status.status-ok {
    color: var(--ok-ink);
  }
  .status.status-under {
    color: var(--under-ink);
  }
  .status.status-over {
    color: var(--over-ink);
  }
  .status.status-none {
    color: var(--text-2);
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
    border: 2px dashed var(--accent);
    padding-right: 12px;
  }
  .slot.due .slot-name {
    color: var(--accent-ink);
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
