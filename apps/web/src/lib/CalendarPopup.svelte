<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Month calendar of the diary, opened from the day's title: complete days in green, started days
     with a dot, today circled. Starts at the sign-up month; a tap opens the day. Looking at another
     day, "Back to today" opens today. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { addDays, isoWeekday, type CalendarDay, type CalendarResponse } from '@mealler/shared';
  import { get } from './api';
  import { errorMessage, formatDate, t } from './state.svelte';
  import Icon from './Icon.svelte';

  let {
    selected,
    today,
    onpick,
    onclose
  }: { selected: string; today: string; onpick: (date: string) => void; onclose: () => void } = $props();

  const nextMonth = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  };
  const prevMonth = (m: string) => {
    const [y, mm] = m.split('-').map(Number);
    return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
  };

  // Opens on the month of the day being viewed.
  let month = $state(untrack(() => selected.slice(0, 7)));
  let since = $state<string | null>(null);
  let days = $state<Map<string, CalendarDay>>(new Map());
  let error = $state('');
  let dialog = $state<HTMLDivElement | null>(null);

  const monthStart = $derived(`${month}-01`);
  const monthEnd = $derived(addDays(`${nextMonth(month)}-01`, -1));
  const canPrev = $derived(!since || month > since.slice(0, 7));
  const canNext = $derived(month < today.slice(0, 7));

  $effect(() => {
    const [from, to] = [monthStart, monthEnd];
    error = '';
    get<CalendarResponse>(`/calendar?from=${from}&to=${to}`)
      .then((res) => {
        if (from !== monthStart) return;
        since = res.since;
        days = new Map(res.days.map((d) => [d.date, d]));
      })
      .catch((e) => (error = errorMessage(e)));
  });

  const cells = $derived.by(() => {
    const out: (string | null)[] = [];
    for (let i = 1; i < isoWeekday(monthStart); i++) out.push(null);
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) out.push(d);
    return out;
  });

  function statusOf(date: string): 'complete' | 'partial' | 'none' {
    const d = days.get(date);
    if (!d || d.total === 0 || date > today) return 'none';
    if (d.filled >= d.total) return 'complete';
    return d.filled > 0 ? 'partial' : 'none';
  }

  function label(date: string): string {
    const name = formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
    const d = days.get(date);
    const s = statusOf(date);
    if (s === 'none' || !d) return name;
    return `${name}, ${t(s === 'complete' ? 'calendar.complete' : 'calendar.partial', { n: d.filled, total: d.total })}`;
  }

  // Focus goes to the popup itself, so screen readers read it and no focus ring lands on a button.
  onMount(() => dialog?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="backdrop" type="button" tabindex="-1" aria-label={t('common.close')} onclick={onclose}></button>
<div class="wrap">
  <div bind:this={dialog} class="card popup" role="dialog" tabindex="-1" aria-modal="true" aria-labelledby="calendar-title">
    <div class="head">
      <button class="icon-btn plain" type="button" aria-label={t('weight.prevMonth')} disabled={!canPrev} onclick={() => (month = prevMonth(month))}>
        <Icon name="left" />
      </button>
      <h2 id="calendar-title" class="grow">{formatDate(monthStart, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn plain" type="button" aria-label={t('weight.nextMonth')} disabled={!canNext} onclick={() => (month = nextMonth(month))}>
        <Icon name="right" />
      </button>
      <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={onclose}>
        <Icon name="close" />
      </button>
    </div>

    <div class="grid names" aria-hidden="true">
      {#each [1, 2, 3, 4, 5, 6, 7] as const as d (d)}<span>{t(`weekday.short.${d}`)}</span>{/each}
    </div>
    <div class="grid">
      {#each cells as cell, i (cell ?? `blank-${i}`)}
        {#if cell}
          {@const s = statusOf(cell)}
          <div class="cell">
            <button
              type="button"
              class="day {s}"
              class:today={cell === today}
              class:selected={cell === selected}
              disabled={!!since && cell < since}
              aria-current={cell === today ? 'date' : undefined}
              aria-label={label(cell)}
              onclick={() => onpick(cell)}>
              {Number(cell.slice(8))}
              {#if s === 'partial'}<span class="dot" aria-hidden="true"></span>{/if}
            </button>
          </div>
        {:else}
          <div class="cell"></div>
        {/if}
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    <div class="legend" aria-hidden="true">
      <span><span class="sw complete"></span>{t('calendar.legendComplete')}</span>
      <span><span class="sw partial"></span>{t('calendar.legendPartial')}</span>
      <span><span class="sw today"></span>{t('weight.legendToday')}</span>
    </div>

    {#if selected !== today}
      <button class="btn btn-block" type="button" onclick={() => onpick(today)}>{t('day.goToday')}</button>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: none;
    padding: 0;
    background: rgb(0 0 0 / 0.45);
    animation: fade-in 200ms ease-out;
    cursor: default;
  }
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 41;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(16px, var(--status-clear)) 16px max(16px, env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .popup {
    pointer-events: auto;
    width: 100%;
    max-width: 420px;
    padding: 12px 12px 16px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
    animation: pop-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .popup:focus {
    outline: none;
  }
  .popup > .btn {
    margin-top: 14px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-bottom: 4px;
  }
  .head .icon-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }
  h2 {
    font-size: 17px;
    font-weight: 700;
    text-align: center;
    text-transform: capitalize;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .grid.names {
    padding: 4px 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-2);
    text-align: center;
  }
  .cell {
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .day {
    position: relative;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: 22px;
    border: 2px solid transparent;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
  }
  .day:disabled {
    color: var(--text-2);
    opacity: 0.45;
    cursor: default;
  }
  .day.selected {
    background: var(--surface-2);
  }
  /* The darker green keeps the number readable (white on it in light mode, dark in dark mode). */
  .day.complete {
    background: var(--good-ink);
    color: var(--surface);
    font-weight: 700;
  }
  .day.today {
    border-color: var(--text);
    font-weight: 700;
  }
  .dot {
    position: absolute;
    left: 50%;
    bottom: 5px;
    width: 6px;
    height: 6px;
    margin-left: -3px;
    border-radius: 3px;
    background: var(--good);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
    padding-top: 10px;
    font-size: 13px;
    color: var(--text-2);
  }
  .legend > span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 14px;
    height: 14px;
    border-radius: 7px;
  }
  .sw.complete {
    background: var(--good-ink);
  }
  .sw.partial {
    width: 6px;
    height: 6px;
    margin: 4px;
    background: var(--good);
  }
  .sw.today {
    border: 2px solid var(--text);
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
  }
</style>
