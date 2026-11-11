<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Daily bars with the threshold band drawn per day; colour AND a legend explain the status.
     Same colours as the day view. Bars grow from the baseline when they appear. A day with a value is a
     button: tapping it selects it (the other bars fade and its value shows above it) and tapping it
     again lets it go. -->
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
  import ValueTag from './ValueTag.svelte';

  let {
    data,
    unit,
    label,
    selected = null,
    onselect,
    describe
  }: {
    data: BarDatum[];
    unit: string;
    label: string;
    selected?: string | null;
    onselect?: (date: string | null) => void;
    /** Spoken name of a bar's button: its day and value. */
    describe?: (d: BarDatum) => string;
  } = $props();

  function pick(date: string) {
    onselect?.(selected === date ? null : date);
  }

  function key(event: KeyboardEvent, date: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pick(date);
  }

  let width = $state(320);
  const height = 200;
  const left = 40;
  const bottom = 26;
  // Room above the tallest bar for the value of the one chosen.
  const top = 24;

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
        <rect
          class="grow"
          class:faded={selected != null && selected !== d.date}
          style="animation-delay: {Math.round((i * 450) / data.length)}ms"
          x={x + slot * 0.18}
          width={slot * 0.64}
          y={y(d.value)}
          height={top + plotH - y(d.value)}
          rx={Math.min(4, slot * 0.2)}
          fill={colour[status(d)]} />
      {/if}
      {#if i % labelEvery === 0 || i === data.length - 1}
        <text x={x + slot / 2} y={height - 8} text-anchor="middle" class="axis">{formatDate(d.date, { day: 'numeric', month: data.length > 8 ? 'numeric' : undefined, weekday: data.length <= 8 ? 'narrow' : undefined })}</text>
      {/if}
    {/each}
    {#each data as d, i (d.date)}
      {#if selected === d.date && d.value != null}
        <ValueTag x={left + i * slot + slot / 2} y={y(d.value)} text={formatNumber(d.value, d.value >= 100 ? 0 : 1)} minX={left} maxX={width - 4} />
      {/if}
    {/each}
    {#if onselect}
      <!-- Tap areas as tall as the chart, so even a short bar is easy to hit. -->
      {#each data as d, i (d.date)}
        {#if d.value != null && d.value > 0}
          <rect
            class="hit"
            role="button"
            tabindex="0"
            aria-pressed={selected === d.date}
            aria-label={describe ? describe(d) : `${d.date}: ${formatNumber(d.value)} ${unit}`}
            x={left + i * slot}
            y={top}
            width={slot}
            height={plotH}
            onclick={() => pick(d.date)}
            onkeydown={(e) => key(e, d.date)} />
        {/if}
      {/each}
    {/if}
  </svg>
  <!-- A table is never narrower than its text: hidden inside a box that is, so it never widens the page. -->
  <div class="visually-hidden">
  <table>
    <caption>{label}</caption>
    <tbody>
      {#each data as d (d.date)}
        <tr><th scope="row">{d.date}</th><td>{d.value == null ? '—' : `${formatNumber(d.value)} ${unit}`}</td></tr>
      {/each}
    </tbody>
  </table>
  </div>
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
  .faded {
    opacity: 0.3;
    transition: opacity 200ms;
  }
  .hit {
    fill: transparent;
    cursor: pointer;
    outline: none;
  }
  .hit:focus-visible {
    stroke: var(--accent);
    stroke-width: 2;
  }
</style>
