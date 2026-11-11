<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Weight tab: last weigh-in, month calendar, reminder settings, chart. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { addDays, isoWeekday, todayIn, weightFrom, weightIn, weightUnit, type User, type WeightEntry } from '@mealler/shared';
  import { del, get, patch, put } from './api';
  import { app, clock, errorMessage, formatDate, formatNumber, setUser, t } from './state.svelte';
  import Icon from './Icon.svelte';
  import WeightChart from './WeightChart.svelte';

  const user = $derived(app.user as User);
  const today = $derived(todayIn(user.timezone, new Date(clock.now)));
  // Weights are stored in kg and shown in pounds with US units.
  const units = $derived(user.units ?? 'metric');
  const unit = $derived(weightUnit(units));
  const shown = (kg: number) => weightIn(kg, units);

  let month = $state(todayIn(app.user?.timezone ?? 'UTC').slice(0, 7)); // YYYY-MM
  let monthWeights = $state<WeightEntry[]>([]);
  let history = $state<WeightEntry[]>([]);
  let error = $state('');

  let formOpen = $state(false);
  let formDate = $state('');
  let formKg = $state('');
  let formNote = $state('');
  let editingExisting = $state(false);

  let reminderOpen = $state(false);
  let rEnabled = $state(app.user?.weightReminderEnabled ?? false);
  let rWeeks = $state(app.user?.weightReminderWeeks ?? 2);
  let rWeekday = $state(app.user?.weightReminderWeekday ?? 1);
  let rTime = $state(app.user?.weightReminderTime ?? '07:30');

  const monthStart = $derived(`${month}-01`);
  const monthEnd = $derived(addDays(`${nextMonth(month)}-01`, -1));

  function nextMonth(m: string): string {
    const [y, mm] = m.split('-').map(Number);
    return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`;
  }
  function prevMonth(m: string): string {
    const [y, mm] = m.split('-').map(Number);
    return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`;
  }

  async function loadMonth() {
    try {
      monthWeights = await get<WeightEntry[]>(`/weights?from=${monthStart}&to=${monthEnd}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }
  async function loadHistory() {
    try {
      history = await get<WeightEntry[]>(`/weights?from=${addDays(today, -365)}&to=${today}`);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  onMount(loadHistory);
  $effect(() => {
    void monthStart;
    loadMonth();
  });

  const last = $derived(history.at(-1) ?? null);
  const previous = $derived(history.length > 1 ? history[history.length - 2] : null);

  // Next reminder: the chosen weekday, once about N weeks have passed since the last weigh-in.
  const nextReminder = $derived.by(() => {
    if (!user.weightReminderEnabled) return null;
    let from = today;
    if (last) {
      const due = addDays(last.date, user.weightReminderWeeks * 7 - 1);
      if (due > from) from = due;
    }
    for (let i = 0; i < 7; i++) {
      const d = addDays(from, i);
      if (isoWeekday(d) === user.weightReminderWeekday) return d;
    }
    return null;
  });

  const cells = $derived.by(() => {
    const out: (string | null)[] = [];
    const lead = isoWeekday(monthStart) - 1;
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = monthStart; d <= monthEnd; d = addDays(d, 1)) out.push(d);
    return out;
  });
  const byDate = $derived(new Map(monthWeights.map((w) => [w.date, w])));

  function openForm(date: string) {
    const existing = byDate.get(date) ?? history.find((w) => w.date === date);
    formDate = date;
    formKg = existing ? formatNumber(shown(existing.kg), 1) : last ? formatNumber(shown(last.kg), 1) : '';
    formNote = existing?.note ?? '';
    editingExisting = !!existing;
    formOpen = true;
  }

  async function saveWeight(event: SubmitEvent) {
    event.preventDefault();
    const value = Number(formKg.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    const kg = weightFrom(value, units);
    try {
      await put(`/weights/${formDate}`, { kg, note: formNote || null });
      formOpen = false;
      await Promise.all([loadMonth(), loadHistory()]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function removeWeight() {
    try {
      await del(`/weights/${formDate}`);
      formOpen = false;
      await Promise.all([loadMonth(), loadHistory()]);
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function saveReminder(event: SubmitEvent) {
    event.preventDefault();
    try {
      setUser(
        await patch<User>('/me', {
          weightReminderEnabled: rEnabled,
          weightReminderWeeks: Number(rWeeks),
          weightReminderWeekday: Number(rWeekday),
          weightReminderTime: rTime
        })
      );
      reminderOpen = false;
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;
  const dayName = (n: number) => t(`weekday.long.${n as 1 | 2 | 3 | 4 | 5 | 6 | 7}`);
</script>

{#if error}<p class="error" role="alert">{error}</p>{/if}

<section class="card last" aria-label={t('trends.weight')}>
  <div class="grow">
    {#if last}
      <p class="muted small">{t('weight.last', { d: formatDate(last.date, { day: 'numeric', month: 'long' }) })}</p>
      <p><span class="big">{formatNumber(shown(last.kg), 1)}</span> <span class="muted">{unit}</span></p>
      {#if previous}
        {@const delta = Math.round((shown(last.kg) - shown(previous.kg)) * 10) / 10}
        <p class="muted small change">
          <Icon name={delta < 0 ? 'down' : delta > 0 ? 'up' : 'minus'} size={14} stroke={2.5} />
          {t('weight.change', { delta: formatNumber(Math.abs(delta), 1), unit, d: formatDate(previous.date, { day: 'numeric', month: 'long' }) })}
        </p>
      {/if}
    {:else}
      <p class="muted">{t('weight.none')}</p>
    {/if}
  </div>
  <button class="btn btn-primary" type="button" onclick={() => openForm(today)}><Icon name="plus" size={20} />{t('weight.log')}</button>
</section>

{#if formOpen}
  <form class="card stack" onsubmit={saveWeight}>
    <div class="pair">
      <div class="field">
        <label for="w-date">{t('weight.date')}</label>
        <input id="w-date" type="date" required max={today} bind:value={formDate} />
      </div>
      <div class="field">
        <label for="w-kg">{units === 'us' ? t('weight.lb') : t('weight.kg')}</label>
        <input id="w-kg" inputmode="decimal" required autocomplete="off" bind:value={formKg} />
      </div>
    </div>
    <div class="field">
      <label for="w-note">{t('weight.note')} <span class="muted small">({t('common.optional')})</span></label>
      <input id="w-note" maxlength="500" bind:value={formNote} />
    </div>
    <div class="row">
      <button class="btn btn-primary" type="submit">{t('weight.save')}</button>
      <button class="btn btn-ghost" type="button" onclick={() => (formOpen = false)}>{t('common.cancel')}</button>
      {#if editingExisting}<button class="btn btn-danger" type="button" onclick={removeWeight}>{t('weight.delete')}</button>{/if}
    </div>
  </form>
{/if}

<section class="card calendar" aria-labelledby="cal-title">
  <div class="cal-head">
    <h2 id="cal-title" class="grow">{formatDate(monthStart, { month: 'long', year: 'numeric' })}</h2>
    <button class="icon-btn plain" type="button" aria-label={t('weight.prevMonth')} onclick={() => (month = prevMonth(month))}><Icon name="left" /></button>
    <button class="icon-btn plain" type="button" aria-label={t('weight.nextMonth')} onclick={() => (month = nextMonth(month))}><Icon name="right" /></button>
  </div>
  <div class="grid head" aria-hidden="true">
    {#each weekdays as d (d)}<span>{t(`weekday.short.${d}`)}</span>{/each}
  </div>
  <div class="grid">
    {#each cells as cell, i (i)}
      {#if cell}
        {@const w = byDate.get(cell)}
        <div class="cell">
          <button
            type="button"
            class="day"
            class:weighed={!!w}
            class:today={cell === today}
            class:reminder={cell === nextReminder && !w}
            disabled={cell > today}
            aria-current={cell === today ? 'date' : undefined}
            aria-label={w
              ? t('weight.dayLabel', { d: formatDate(cell, { day: 'numeric', month: 'long' }), kg: formatNumber(shown(w.kg), 1), unit })
              : formatDate(cell, { day: 'numeric', month: 'long' })}
            onclick={() => openForm(cell)}>{Number(cell.slice(8))}</button>
        </div>
      {:else}
        <div class="cell"></div>
      {/if}
    {/each}
  </div>
  <div class="legend">
    <span><span class="dot weighed"></span>{t('weight.legendWeighed')}</span>
    <span><span class="dot reminder"></span>{t('weight.legendReminder')}</span>
    <span><span class="dot today"></span>{t('weight.legendToday')}</span>
  </div>
</section>

<section class="card reminder-card" aria-labelledby="rem-title">
  {#if reminderOpen}
    <form class="stack" onsubmit={saveReminder}>
      <h2 id="rem-title" class="label">{t('weight.reminder')}</h2>
      <label class="check"><input type="checkbox" bind:checked={rEnabled} /><span>{t('weight.enable')}</span></label>
      <div class="field">
        <label for="r-weeks">{t('weight.weeks')}</label>
        <select id="r-weeks" bind:value={rWeeks} disabled={!rEnabled}>
          {#each [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as n (n)}
            <option value={n}>{n === 1 ? t('weight.every1') : t('weight.everyN', { n })}</option>
          {/each}
        </select>
      </div>
      <div class="pair">
        <div class="field">
          <label for="r-day">{t('weight.weekday')}</label>
          <select id="r-day" bind:value={rWeekday} disabled={!rEnabled}>
            {#each weekdays as d (d)}<option value={d}>{dayName(d)}</option>{/each}
          </select>
        </div>
        <div class="field">
          <label for="r-time">{t('weight.time')}</label>
          <input id="r-time" type="time" bind:value={rTime} disabled={!rEnabled} />
        </div>
      </div>
      <div class="row">
        <button class="btn btn-primary" type="submit">{t('common.save')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (reminderOpen = false)}>{t('common.cancel')}</button>
      </div>
    </form>
  {:else}
    <div class="rem-row">
      <span class="bell"><Icon name="bell" size={20} /></span>
      <div class="grow">
        <h2 id="rem-title" class="rem-title">
          {#if user.weightReminderEnabled}
            {user.weightReminderWeeks === 1 ? t('weight.every1') : t('weight.everyN', { n: user.weightReminderWeeks })}
          {:else}
            {t('weight.reminderOff')}
          {/if}
        </h2>
        {#if user.weightReminderEnabled}
          <p class="muted small">
            {t('weight.when', { day: dayName(user.weightReminderWeekday), time: user.weightReminderTime })}{#if nextReminder}{` · ${t('weight.next', { d: formatDate(nextReminder, { day: 'numeric', month: 'short' }) })}`}{/if}
          </p>
        {/if}
      </div>
      <button class="btn btn-ghost" type="button" onclick={() => (reminderOpen = true)}>{t('common.edit')}</button>
    </div>
  {/if}
</section>

{#if history.length > 1}
  <section class="card stack" aria-labelledby="wchart-title">
    <h2 id="wchart-title" class="label">{t('weight.chart')}</h2>
    <WeightChart data={history} />
  </section>
{/if}

<style>
  .grow {
    flex: 1;
    min-width: 0;
  }
  .last {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .big {
    font-size: 28px;
    font-weight: 700;
  }
  .change {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .calendar {
    padding: 8px 12px 12px;
  }
  .cal-head {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-left: 8px;
  }
  .cal-head h2 {
    font-size: 17px;
    font-weight: 700;
    text-transform: capitalize;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
  }
  .grid.head {
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
    cursor: default;
  }
  .day.weighed {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 700;
  }
  .day.today {
    border-color: var(--text);
    font-weight: 700;
  }
  .day.reminder {
    border: 2px dashed var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 8px 8px 0;
    font-size: 13px;
    color: var(--text-2);
  }
  .legend > span {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .dot {
    width: 14px;
    height: 14px;
    border-radius: 7px;
    box-sizing: border-box;
  }
  .dot.weighed {
    background: var(--accent);
  }
  .dot.reminder {
    border: 2px dashed var(--accent);
  }
  .dot.today {
    border: 2px solid var(--text);
  }
  .rem-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .bell {
    width: 40px;
    height: 40px;
    flex: none;
    border-radius: 20px;
    background: var(--accent-soft);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .rem-title {
    font-size: 15px;
    font-weight: 600;
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
</style>
