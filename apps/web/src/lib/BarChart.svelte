<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Daily bars with the threshold band drawn per day; colour AND a legend explain the status.
     Same colours as the day view. Bars grow from the baseline when they appear. -->
<script lang="ts" module>
  export interface BarDatum {
    date: string;
    value: number | null; // null = no meals that day
    min: number | null;
    max: number | null;
  }
</script>

<script lang="ts">
  import { thresholdStatus, type ThresholdStatus } from '@mealler/shared';
  import { formatDate, formatNumber } from './state.svelte';

  let { data, unit, label }: { data: BarDatum[]; unit: string; label: string } = $props();

  let width = $state(320);
  const height = 200;
  const left = 40;
  const bottom = 26;
  const top = 10;

  const peak = $derived(
    Math.max(1, ...data.map((d) => Math.max(d.value ?? 0, d.max ?? 0, d.min ?? 0))) * 1.12
  );
  const plotW = $derived(Math.max(10, width - left - 4));
  const plotH = height - top - bottom;
  const slot = $derived(plotW / Math.max(1, data.length));
  const y = (v: number) => top + plotH - (v / peak) * plotH;
  const ticks = $derived([0, peak / 3, (2 * peak) / 3].map((v) => (v > 20 ? Math.round(v / 10) * 10 : Math.round(v))));
  const labelEvery = $derived(Math.max(1, Math.ceil(data.length / 6)));

  const status = (d: BarDatum): ThresholdStatus => (d.value == null ? 'none' : thresholdStatus(d.value, d.min, d.max));
  const colour: Record<ThresholdStatus, string> = {
    ok: 'var(--ok)',
    under: 'var(--under)',
    over: 'var(--over)',
    none: 'var(--text-2)'
  };
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={label}>
    {#each ticks as tick (tick)}
      <line x1={left} x2={width - 4} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
      <text x={left - 6} y={y(tick) + 4} text-anchor="end" class="axis">{formatNumber(tick)}</text>
    {/each}
    {#each data as d, i (d.date)}
      {@const x = left + i * slot}
      {#if d.min != null || d.max != null}
        <rect
          x={x + 1}
          width={slot - 2}
          y={y(d.max ?? peak)}
          height={Math.max(0, y(d.min ?? 0) - y(d.max ?? peak))}
          fill="var(--accent-soft)" />
      {/if}
      {#if d.value != null && d.value > 0}
        <rect class="grow" style="animation-delay: {Math.round((i * 450) / data.length)}ms" x={x + slot * 0.18} width={slot * 0.64} y={y(d.value)} height={top + plotH - y(d.value)} rx={Math.min(4, slot * 0.2)} fill={colour[status(d)]} />
      {/if}
      {#if i % labelEvery === 0 || i === data.length - 1}
        <text x={x + slot / 2} y={height - 8} text-anchor="middle" class="axis">{formatDate(d.date, { day: 'numeric', month: data.length > 8 ? 'numeric' : undefined, weekday: data.length <= 8 ? 'narrow' : undefined })}</text>
      {/if}
    {/each}
  </svg>
  <table class="visually-hidden">
    <caption>{label}</caption>
    <tbody>
      {#each data as d (d.date)}
        <tr><th scope="row">{d.date}</th><td>{d.value == null ? '—' : `${formatNumber(d.value)} ${unit}`}</td></tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .chart {
    width: 100%;
  }
  svg {
    display: block;
  }
  /* Same easing as the progress bars. */
  .grow {
    transform-box: fill-box;
    transform-origin: bottom;
    animation: grow 900ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes grow {
    from {
      transform: scaleY(0);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .grow {
      animation: none;
    }
  }
  .axis {
    font-size: 11px;
    fill: var(--text-2);
  }
</style>
