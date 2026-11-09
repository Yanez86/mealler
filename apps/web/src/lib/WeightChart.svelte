<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import type { WeightEntry } from '@mealler/shared';
  import { formatDate, formatNumber, t } from './state.svelte';

  let { data }: { data: WeightEntry[] } = $props();

  let width = $state(320);
  const height = 170;
  const left = 40;
  const top = 12;
  const bottom = 24;

  const toDay = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
  const minKg = $derived(Math.floor(Math.min(...data.map((d) => d.kg)) - 1));
  const maxKg = $derived(Math.ceil(Math.max(...data.map((d) => d.kg)) + 1));
  const first = $derived(toDay(data[0]?.date ?? '2000-01-01'));
  const last = $derived(toDay(data.at(-1)?.date ?? '2000-01-01'));
  const x = (d: string) => left + 8 + ((toDay(d) - first) / Math.max(1, last - first)) * (width - left - 24);
  const y = (kg: number) => top + (1 - (kg - minKg) / Math.max(1, maxKg - minKg)) * (height - top - bottom);
  const path = $derived(data.map((d, i) => `${i ? 'L' : 'M'}${x(d.date)} ${y(d.kg)}`).join(' '));
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={t('weight.chart')}>
    {#each [minKg, (minKg + maxKg) / 2, maxKg] as tick (tick)}
      <line x1={left} x2={width - 4} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
      <text x={left - 6} y={y(tick) + 4} text-anchor="end" class="axis">{formatNumber(tick, 1)}</text>
    {/each}
    {#if data.length > 1}<path d={path} fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" />{/if}
    {#each data as d (d.date)}
      <circle cx={x(d.date)} cy={y(d.kg)} r="4.5" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5" />
    {/each}
    {#if data.length}
      <text x={x(data[0].date)} y={height - 6} text-anchor="start" class="axis">{formatDate(data[0].date, { day: 'numeric', month: 'short' })}</text>
      {#if data.length > 1}
        <text x={x(data[data.length - 1].date)} y={height - 6} text-anchor="end" class="axis">{formatDate(data[data.length - 1].date, { day: 'numeric', month: 'short' })}</text>
      {/if}
    {/if}
  </svg>
  <ul class="visually-hidden">
    {#each data as d (d.date)}<li>{t('weight.dayLabel', { d: d.date, kg: formatNumber(d.kg, 1) })}</li>{/each}
  </ul>
</div>

<style>
  .chart {
    width: 100%;
  }
  svg {
    display: block;
  }
  .axis {
    font-size: 11px;
    fill: var(--text-2);
  }
</style>
