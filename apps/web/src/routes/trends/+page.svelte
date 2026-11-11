<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import {
    ML_PER_FLOZ,
    NUTRIENTS,
    NUTRIENT_UNITS,
    addDays,
    thresholdStatus,
    todayIn,
    type Nutrient,
    type TrendDay,
    type TrendsResponse
  } from '@mealler/shared';
  import { get } from '$lib/api';
  import { app, clock, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import BarChart, { type BarDatum } from '$lib/BarChart.svelte';
  import LineChart, { type LinePoint } from '$lib/LineChart.svelte';
  import NutrientIcon from '$lib/NutrientIcon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import WeightPanel from '$lib/WeightPanel.svelte';
  import { waterText } from '$lib/water';

  type Tab = 'nutrients' | 'water' | 'weight';
  const tab = $derived.by((): Tab => {
    const asked = page.url.searchParams.get('tab');
    return asked === 'weight' || asked === 'water' ? asked : 'nutrients';
  });
  const today = $derived(todayIn(app.user?.timezone ?? 'UTC', new Date(clock.now)));

  const spans = [7, 30, 90] as const;
  let span = $state<7 | 30 | 90>(7);
  let nutrient = $state<Nutrient>('kcal');
  let trends = $state<TrendsResponse | null>(null);
  let error = $state('');

  $effect(() => {
    if (tab === 'weight') return;
    const from = addDays(today, -(span - 1));
    error = '';
    get<TrendsResponse>(`/trends?from=${from}&to=${today}`)
      .then((res) => (trends = res))
      .catch((e) => (error = errorMessage(e)));
  });

  const unit = $derived(NUTRIENT_UNITS[nutrient]);
  const logged = $derived(trends ? trends.days.filter((d) => d.entries > 0) : []);
  const average = $derived(logged.length ? logged.reduce((s, d) => s + d[nutrient], 0) / logged.length : null);
  const withLimits = $derived(logged.filter((d) => d.limits[nutrient].min != null || d.limits[nutrient].max != null));
  const inRange = $derived(
    withLimits.filter((d) => thresholdStatus(d[nutrient], d.limits[nutrient].min, d.limits[nutrient].max) === 'ok').length
  );
  const bars = $derived(
    trends
      ? trends.days.map((d) => ({
          date: d.date,
          value: d.entries > 0 ? d[nutrient] : null,
          min: d.limits[nutrient].min,
          max: d.limits[nutrient].max
        }))
      : []
  );
  // Share of energy from protein, carbs and fat (4/4/9 kcal per gram), averaged over logged days.
  const split = $derived.by(() => {
    if (!logged.length) return null;
    const p = logged.reduce((s, d) => s + d.protein * 4, 0);
    const c = logged.reduce((s, d) => s + d.carbs * 4, 0);
    const f = logged.reduce((s, d) => s + d.fat * 9, 0);
    const total = p + c + f;
    if (!total) return null;
    return [
      { key: 'protein' as const, pct: Math.round((p / total) * 100), colour: 'var(--under)' },
      { key: 'carbs' as const, pct: Math.round((c / total) * 100), colour: 'var(--ok)' },
      { key: 'fat' as const, pct: Math.round((f / total) * 100), colour: 'var(--over)' }
    ];
  });

  function setTab(next: Tab) {
    goto(next === 'nutrients' ? '/trends' : `/trends?tab=${next}`, { replaceState: true, noScroll: true, keepFocus: true });
  }

  // ---------- Water ----------
  // Shown in ml, or fl oz with US units; the goal is the one set now.
  const us = $derived(app.user?.units === 'us');
  const waterUnit = $derived(us ? 'fl oz' : 'ml');
  const waterShown = (ml: number) => (us ? Math.round(ml / ML_PER_FLOZ) : ml);
  const goal = $derived(app.user?.waterGoalMl ?? 2000);
  const waterDays = $derived(trends ? trends.days.filter((d) => d.water > 0) : []);
  const waterAverage = $derived(waterDays.length ? waterDays.reduce((s, d) => s + d.water, 0) / waterDays.length : null);
  const atGoal = $derived(waterDays.filter((d) => d.water >= goal).length);
  const waterBars = $derived(
    trends
      ? trends.days.map((d) => ({ date: d.date, value: d.water > 0 ? waterShown(d.water) : null, min: waterShown(goal), max: null }))
      : []
  );

  // ---------- A day picked on a chart ----------
  // A tap on a bar (or on a point of the daily line) shows that day under the chart tapped.
  let selected = $state<{ date: string; from: 'bars' | 'line' } | null>(null);
  const selectedDay = $derived(selected && trends ? (trends.days.find((d) => d.date === selected?.date) ?? null) : null);
  $effect(() => {
    void tab;
    void span;
    selected = null;
  });
  const pickBar = (date: string | null) => (selected = date ? { date, from: 'bars' } : null);
  const pickPoint = (date: string | null) => (selected = date ? { date, from: 'line' } : null);
  const dayName = (date: string) => formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
  const dayHref = (date: string) => (date === today ? '/' : `/?d=${date}`);
  const describeBar = (d: BarDatum) => `${dayName(d.date)}: ${formatNumber(d.value ?? 0, 1)} ${tab === 'water' ? waterUnit : unit}`;

  // ---------- Trend line, by day or by month ----------
  // The same measure as the bars: the nutrient chosen, or the water.
  let lineMode = $state<'day' | 'month'>('day');
  const valueOf = (d: TrendDay): number | null =>
    tab === 'water' ? (d.water > 0 ? waterShown(d.water) : null) : d.entries > 0 ? d[nutrient] : null;
  const limitsOf = (d: TrendDay) => (tab === 'water' ? { min: waterShown(goal), max: null } : d.limits[nutrient]);
  const dayLabel = (date: string, count: number) =>
    formatDate(date, { day: 'numeric', month: count > 8 ? 'numeric' : undefined, weekday: count <= 8 ? 'narrow' : undefined });
  const dayPoints = $derived<LinePoint[]>(
    trends
      ? trends.days.map((d) => ({ key: d.date, label: dayLabel(d.date, trends?.days.length ?? 0), value: valueOf(d), ...limitsOf(d) }))
      : []
  );

  // The last 12 months, this one included: each point is the month's average over the days logged.
  const months = $derived.by(() => {
    const out: string[] = [];
    let [y, m] = today.slice(0, 7).split('-').map(Number);
    for (let i = 0; i < 12; i++) {
      out.unshift(`${y}-${String(m).padStart(2, '0')}`);
      m -= 1;
      if (m === 0) [y, m] = [y - 1, 12];
    }
    return out;
  });
  let monthly = $state<TrendsResponse | null>(null);
  let selectedMonth = $state<string | null>(null);
  $effect(() => {
    if (tab === 'weight' || lineMode !== 'month') return;
    get<TrendsResponse>(`/trends?from=${months[0]}-01&to=${today}`)
      .then((res) => (monthly = res))
      .catch((e) => (error = errorMessage(e)));
  });
  $effect(() => {
    void tab;
    void nutrient;
    void lineMode;
    selectedMonth = null;
  });
  const monthStats = $derived(
    months.map((key) => {
      const days = (monthly?.days ?? []).filter((d) => d.date.startsWith(key) && (tab === 'water' ? d.water > 0 : d.entries > 0));
      const raw = days.length ? days.reduce((s, d) => s + (tab === 'water' ? d.water : d[nutrient]), 0) / days.length : null;
      return { key, days: days.length, raw };
    })
  );
  const monthPoints = $derived.by<LinePoint[]>(() => {
    const last = monthly?.days.at(-1);
    const band = tab === 'water' ? { min: waterShown(goal), max: null } : (last?.limits[nutrient] ?? { min: null, max: null });
    return monthStats.map((m) => ({
      key: m.key,
      label: formatDate(`${m.key}-01`, { month: 'short' }),
      value: m.raw == null ? null : tab === 'water' ? waterShown(m.raw) : Math.round(m.raw * 10) / 10,
      ...band
    }));
  });
  const monthInfo = $derived.by(() => {
    const m = monthStats.find((x) => x.key === selectedMonth);
    if (!m || m.raw == null) return null;
    const value = tab === 'water' ? waterText(m.raw) : `${formatNumber(m.raw, nutrient === 'kcal' ? 0 : 1)} ${unit}`;
    const month = formatDate(`${m.key}-01`, { month: 'long', year: 'numeric' });
    return t('trends.monthAverage', { month: month.charAt(0).toUpperCase() + month.slice(1), value, n: m.days });
  });
  const lineUnit = $derived(tab === 'water' ? waterUnit : unit);
  const lineName = $derived(tab === 'water' ? t('water.title') : t(`nutrient.${nutrient}`));
</script>

{#snippet nutrientDay(d: TrendDay)}
  <div class="detail" role="status">
    <p class="detail-title">{dayName(d.date)}</p>
    <ul class="detail-list">
      {#each NUTRIENTS as n (n)}
        {@const st = thresholdStatus(d[n], d.limits[n].min, d.limits[n].max)}
        <li>
          <NutrientIcon nutrient={n} size={20} />
          <span class="grow">{t(`nutrient.${n}`)}</span>
          <strong class={st === 'none' ? '' : `status-ink-${st}`}>{formatNumber(d[n], n === 'kcal' ? 0 : 1)} {NUTRIENT_UNITS[n]}</strong>
        </li>
      {/each}
    </ul>
    <a class="btn btn-block" href={dayHref(d.date)}>{t('trends.openDay')}</a>
  </div>
{/snippet}

{#snippet waterDay(d: TrendDay)}
  <div class="detail" role="status">
    <p class="detail-title">{dayName(d.date)}</p>
    <p><strong class={d.water >= goal ? 'status-ink-ok' : 'status-ink-under'}>{waterText(d.water)}</strong> <span class="muted">{t('water.of', { goal: waterText(goal) })}</span></p>
    <a class="btn btn-block" href={dayHref(d.date)}>{t('trends.openDay')}</a>
  </div>
{/snippet}

{#snippet trendLine()}
  <section class="card stack" aria-labelledby="line-title">
    <div class="line-head">
      <h2 id="line-title" class="label">{t('trends.line')} · {lineName}</h2>
      <div class="mini-seg" role="group" aria-label={t('trends.line')}>
        <button type="button" aria-pressed={lineMode === 'day'} onclick={() => (lineMode = 'day')}>{t('trends.byDay')}</button>
        <button type="button" aria-pressed={lineMode === 'month'} onclick={() => (lineMode = 'month')}>{t('trends.byMonth')}</button>
      </div>
    </div>
    {#if lineMode === 'day'}
      <LineChart
        points={dayPoints}
        unit={lineUnit}
        label={t('trends.lineLabel', { nutrient: lineName })}
        selected={selected?.from === 'line' ? selected.date : null}
        onselect={pickPoint}
        describe={(p) => `${dayName(p.key)}: ${formatNumber(p.value ?? 0, 1)} ${lineUnit}`} />
      {#if selected?.from === 'line' && selectedDay}
        {@render (tab === 'water' ? waterDay : nutrientDay)(selectedDay)}
      {/if}
    {:else if monthly}
      <LineChart
        points={monthPoints}
        unit={lineUnit}
        label={t('trends.lineLabelMonths', { nutrient: lineName })}
        selected={selectedMonth}
        onselect={(key) => (selectedMonth = key)}
        describe={(p) => `${formatDate(`${p.key}-01`, { month: 'long', year: 'numeric' })}: ${formatNumber(p.value ?? 0, 1)} ${lineUnit}`} />
      {#if monthInfo}<p class="detail" role="status">{monthInfo}</p>{/if}
      <p class="help">{tab === 'water' ? t('trends.byMonthHelpWater') : t('trends.byMonthHelp')}</p>
    {:else}
      <p class="muted" role="status">{t('common.loading')}</p>
    {/if}
  </section>
{/snippet}

<svelte:head><title>{t('trends.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('trends.title')} section="trends" />

  <div class="segmented" role="group" aria-label={t('trends.title')}>
    <button type="button" aria-pressed={tab === 'nutrients'} onclick={() => setTab('nutrients')}>{t('trends.nutrients')}</button>
    <button type="button" aria-pressed={tab === 'water'} onclick={() => setTab('water')}>{t('water.title')}</button>
    <button type="button" aria-pressed={tab === 'weight'} onclick={() => setTab('weight')}>{t('trends.weight')}</button>
  </div>

  {#if tab === 'weight'}
    <WeightPanel />
  {:else if tab === 'water'}
    <div class="chips" role="group" aria-label={t('trends.title')}>
      {#each spans as s (s)}
        <button class="chip" type="button" aria-pressed={span === s} onclick={() => (span = s)}>{t(`trends.days${s}`)}</button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if trends}
      {#if !waterDays.length}
        <p class="notice">{t('trends.waterNoData')}</p>
      {:else}
        <section class="card stack" aria-labelledby="water-avg-title">
          <div class="avg">
            <h2 id="water-avg-title" class="muted small">{t('trends.average')} · {t('water.title')}</h2>
            <div class="avg-row">
              <p class="avg-value"><span class="big">{waterText(waterAverage ?? 0)}</span></p>
              <p class="muted small right">{t('trends.waterAtGoal', { n: atGoal, total: waterDays.length })}</p>
            </div>
            <p class="muted small">{t('trends.waterAverageNote', { n: waterDays.length })}</p>
          </div>
          <BarChart
            data={waterBars}
            unit={waterUnit}
            selected={selected?.from === 'bars' ? selected.date : null}
            onselect={pickBar}
            describe={describeBar}
            label={t('trends.chartLabel', {
              nutrient: t('water.title'),
              from: formatDate(trends.from, { day: 'numeric', month: 'long' }),
              to: formatDate(trends.to, { day: 'numeric', month: 'long' })
            })} />
          <div class="legend small muted">
            <span><span class="sw band"></span>{t('trends.waterGoal', { goal: waterText(goal) })}</span>
            <span><span class="sw" style="background: var(--ok)"></span>{t('water.done')}</span>
            <span><span class="sw" style="background: var(--under)"></span>{t('trends.waterUnder')}</span>
          </div>
          {#if selected?.from === 'bars' && selectedDay}
            {@render waterDay(selectedDay)}
          {:else}
            <p class="help">{t('trends.tapHint')}</p>
          {/if}
        </section>
        {@render trendLine()}
      {/if}
    {:else if !error}
      <p class="muted" role="status">{t('common.loading')}</p>
    {/if}
  {:else}
    <div class="chips" role="group" aria-label={t('trends.title')}>
      {#each spans as s (s)}
        <button class="chip" type="button" aria-pressed={span === s} onclick={() => (span = s)}>{t(`trends.days${s}`)}</button>
      {/each}
    </div>
    <div class="chips" role="group" aria-label={t('trends.nutrients')}>
      {#each NUTRIENTS as n (n)}
        <button class="chip" type="button" aria-pressed={nutrient === n} onclick={() => (nutrient = n)}><NutrientIcon nutrient={n} size={20} />{t(`nutrient.${n}`)}</button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if trends}
      {#if !logged.length}
        <p class="notice">{t('trends.noData')}</p>
      {:else}
        <section class="card stack" aria-labelledby="avg-title">
          <div class="avg">
            <h2 id="avg-title" class="muted small">{t('trends.average')} · {t(`nutrient.${nutrient}`)}</h2>
            <div class="avg-row">
              <p class="avg-value"><span class="big">{formatNumber(average ?? 0, nutrient === 'kcal' ? 0 : 1)}</span> <span class="muted">{unit}</span></p>
              {#if withLimits.length}
                <p class="muted small right">{t('trends.inRange', { n: inRange, total: withLimits.length })}</p>
              {/if}
            </div>
            <p class="muted small">{t('trends.averageNote', { n: logged.length })}</p>
          </div>
          {#key nutrient}
            <BarChart
              data={bars}
              {unit}
              selected={selected?.from === 'bars' ? selected.date : null}
              onselect={pickBar}
              describe={describeBar}
              label={t('trends.chartLabel', {
                nutrient: t(`nutrient.${nutrient}`),
                from: formatDate(trends.from, { day: 'numeric', month: 'long' }),
                to: formatDate(trends.to, { day: 'numeric', month: 'long' })
              })} />
          {/key}
          <div class="legend small muted">
            <span><span class="sw band"></span>{t('trends.band')}</span>
            <span><span class="sw" style="background: var(--ok)"></span>{t('day.status.ok')}</span>
            <span><span class="sw" style="background: var(--under)"></span>{t('day.status.under')}</span>
            <span><span class="sw" style="background: var(--over)"></span>{t('day.status.over')}</span>
          </div>
          {#if selected?.from === 'bars' && selectedDay}
            {@render nutrientDay(selectedDay)}
          {:else}
            <p class="help">{t('trends.tapHint')}</p>
          {/if}
        </section>

        {@render trendLine()}

        {#if split}
          <section class="card stack" aria-labelledby="split-title">
            <h2 id="split-title" class="label">{t('trends.split')}</h2>
            <div class="splitbar" aria-hidden="true">
              {#each split as part (part.key)}<span style="width: {part.pct}%; background: {part.colour}"></span>{/each}
            </div>
            <ul class="split">
              {#each split as part (part.key)}
                <li><span class="sw" style="background: {part.colour}"></span>{t(`nutrient.${part.key}`)} <strong>{part.pct}%</strong></li>
              {/each}
            </ul>
          </section>
        {/if}
      {/if}
    {:else if !error}
      <p class="muted" role="status">{t('common.loading')}</p>
    {/if}
  {/if}
</main>

<style>
  .segmented {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 26px;
    background: var(--surface-2);
  }
  .segmented button {
    flex: 1;
    min-height: 44px;
    border: none;
    border-radius: 22px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }
  .segmented button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    font-weight: 700;
  }
  /* Title on its own line, then the average with the days in range beside it, then the note. */
  .avg {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .avg-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .avg-value {
    flex: none;
  }
  .detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--surface-2);
  }
  .detail-title {
    font-weight: 700;
  }
  .detail-title::first-letter {
    text-transform: uppercase;
  }
  .detail-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .detail-list li {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .line-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }
  .mini-seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    border-radius: 20px;
    background: var(--surface-2);
  }
  .mini-seg button {
    min-height: 36px;
    padding: 0 12px;
    border: none;
    border-radius: 17px;
    background: transparent;
    color: var(--text-2);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .mini-seg button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
  }
  .big {
    font-size: 28px;
    font-weight: 700;
  }
  .right {
    text-align: right;
  }
  .legend,
  .split {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .legend > span,
  .split li {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sw {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    display: inline-block;
  }
  .sw.band {
    background: var(--accent-soft);
    border: 1px solid var(--accent);
  }
  .splitbar {
    display: flex;
    height: 14px;
    border-radius: 7px;
    overflow: hidden;
    gap: 2px;
  }
</style>
