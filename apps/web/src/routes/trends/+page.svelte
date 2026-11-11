<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { NUTRIENTS, NUTRIENT_UNITS, addDays, thresholdStatus, todayIn, type Nutrient, type TrendsResponse } from '@mealler/shared';
  import { get } from '$lib/api';
  import { app, clock, errorMessage, formatDate, formatNumber, t } from '$lib/state.svelte';
  import BarChart from '$lib/BarChart.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import WeightPanel from '$lib/WeightPanel.svelte';

  const tab = $derived(page.url.searchParams.get('tab') === 'weight' ? 'weight' : 'nutrients');
  const today = $derived(todayIn(app.user?.timezone ?? 'UTC', new Date(clock.now)));

  const spans = [7, 30, 90] as const;
  let span = $state<7 | 30 | 90>(7);
  let nutrient = $state<Nutrient>('kcal');
  let trends = $state<TrendsResponse | null>(null);
  let error = $state('');

  $effect(() => {
    if (tab !== 'nutrients') return;
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

  function setTab(next: 'nutrients' | 'weight') {
    goto(next === 'weight' ? '/trends?tab=weight' : '/trends', { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>{t('trends.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('trends.title')} section="trends" />

  <div class="segmented" role="group" aria-label={t('trends.title')}>
    <button type="button" aria-pressed={tab === 'nutrients'} onclick={() => setTab('nutrients')}>{t('trends.nutrients')}</button>
    <button type="button" aria-pressed={tab === 'weight'} onclick={() => setTab('weight')}>{t('trends.weight')}</button>
  </div>

  {#if tab === 'weight'}
    <WeightPanel />
  {:else}
    <div class="chips" role="group" aria-label={t('trends.title')}>
      {#each spans as s (s)}
        <button class="chip" type="button" aria-pressed={span === s} onclick={() => (span = s)}>{t(`trends.days${s}`)}</button>
      {/each}
    </div>
    <div class="chips" role="group" aria-label={t('trends.nutrients')}>
      {#each NUTRIENTS as n (n)}
        <button class="chip" type="button" aria-pressed={nutrient === n} onclick={() => (nutrient = n)}>{t(`nutrient.${n}`)}</button>
      {/each}
    </div>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if trends}
      {#if !logged.length}
        <p class="notice">{t('trends.noData')}</p>
      {:else}
        <section class="card stack" aria-labelledby="avg-title">
          <div class="avg">
            <div>
              <h2 id="avg-title" class="muted small">{t('trends.average')} · {t(`nutrient.${nutrient}`)}</h2>
              <p><span class="big">{formatNumber(average ?? 0, nutrient === 'kcal' ? 0 : 1)}</span> <span class="muted">{unit}</span></p>
              <p class="muted small">{t('trends.averageNote', { n: logged.length })}</p>
            </div>
            {#if withLimits.length}
              <p class="muted small right">{t('trends.inRange', { n: inRange, total: withLimits.length })}</p>
            {/if}
          </div>
          {#key nutrient}
            <BarChart
              data={bars}
              {unit}
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
        </section>

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
  .avg {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
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
