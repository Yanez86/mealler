<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A line over days or months, with the threshold band behind it. A missing value leaves a gap
     instead of dropping to zero. Points are coloured like the bars; a point is a button that selects it. -->
<script lang="ts" module>
  export interface LinePoint {
    key: string;
    /** Text under the axis for this point. */
    label: string;
    value: number | null;
    min: number | null;
    max: number | null;
  }
</script>

<script lang="ts">
  import { thresholdStatus, type ThresholdStatus } from '@mealler/shared';
  import { formatNumber } from './state.svelte';

  let {
    points,
    unit,
    label,
    selected = null,
    onselect,
    describe
  }: {
    points: LinePoint[];
    unit: string;
    label: string;
    selected?: string | null;
    onselect?: (key: string | null) => void;
    describe?: (p: LinePoint) => string;
  } = $props();

  let width = $state(320);
  const height = 190;
  const left = 40;
  const bottom = 26;
  const top = 12;

  const peak = $derived(Math.max(1, ...points.map((p) => Math.max(p.value ?? 0, p.max ?? 0, p.min ?? 0))) * 1.12);
  const plotW = $derived(Math.max(10, width - left - 8));
  const plotH = height - top - bottom;
  const slot = $derived(plotW / Math.max(1, points.length));
  const x = (i: number) => left + i * slot + slot / 2;
  const y = (v: number) => top + plotH - (v / peak) * plotH;
  const ticks = $derived([0, peak / 3, (2 * peak) / 3].map((v) => (v > 20 ? Math.round(v / 10) * 10 : Math.round(v))));
  const labelEvery = $derived(Math.max(1, Math.ceil(points.length / 6)));

  // Runs of consecutive values: each is one stretch of line; a lone value is just its point.
  const runs = $derived.by(() => {
    const out: string[] = [];
    let run: string[] = [];
    points.forEach((p, i) => {
      if (p.value == null) {
        if (run.length > 1) out.push(run.join(' '));
        run = [];
      } else run.push(`${x(i)},${y(p.value)}`);
    });
    if (run.length > 1) out.push(run.join(' '));
    return out;
  });

  const colour: Record<ThresholdStatus, string> = {
    ok: 'var(--ok)',
    under: 'var(--under)',
    over: 'var(--over)',
    none: 'var(--text-2)'
  };
  const status = (p: LinePoint): ThresholdStatus => (p.value == null ? 'none' : thresholdStatus(p.value, p.min, p.max));

  function pick(key: string) {
    onselect?.(selected === key ? null : key);
  }

  function keydown(event: KeyboardEvent, key: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    pick(key);
  }
</script>

<div class="chart" bind:clientWidth={width}>
  <svg {width} {height} role="img" aria-label={label}>
    {#each ticks as tick (tick)}
      <line x1={left} x2={width - 8} y1={y(tick)} y2={y(tick)} stroke="var(--border)" />
      <text x={left - 6} y={y(tick) + 4} text-anchor="end" class="axis">{formatNumber(tick)}</text>
    {/each}
    {#each points as p, i (p.key)}
      {#if p.min != null || p.max != null}
        <rect x={left + i * slot} width={slot} y={y(p.max ?? peak)} height={Math.max(0, y(p.min ?? 0) - y(p.max ?? peak))} fill="var(--accent-soft)" />
      {/if}
    {/each}
    {#each runs as run, i (i)}
      <polyline class="line" points={run} />
    {/each}
    {#each points as p, i (p.key)}
      {#if p.value != null}
        <circle
          cx={x(i)}
          cy={y(p.value)}
          r={selected === p.key ? 7 : points.length > 40 ? 2.5 : 4}
          fill={colour[status(p)]}
          class:faded={selected != null && selected !== p.key}
          class:chosen={selected === p.key} />
      {/if}
      {#if i % labelEvery === 0 || i === points.length - 1}
        <text x={x(i)} y={height - 8} text-anchor="middle" class="axis">{p.label}</text>
      {/if}
    {/each}
    {#if onselect}
      {#each points as p, i (p.key)}
        {#if p.value != null}
          <rect
            class="hit"
            role="button"
            tabindex="0"
            aria-pressed={selected === p.key}
            aria-label={describe ? describe(p) : `${p.label}: ${formatNumber(p.value)} ${unit}`}
            x={left + i * slot}
            y={top}
            width={slot}
            height={plotH}
            onclick={() => pick(p.key)}
            onkeydown={(e) => keydown(e, p.key)} />
        {/if}
      {/each}
    {/if}
  </svg>
  <!-- A table is never narrower than its text: hidden inside a box that is, so it never widens the page. -->
  <div class="visually-hidden">
  <table>
    <caption>{label}</caption>
    <tbody>
      {#each points as p (p.key)}
        <tr><th scope="row">{p.label}</th><td>{p.value == null ? '—' : `${formatNumber(p.value)} ${unit}`}</td></tr>
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
  .line {
    fill: none;
    stroke: var(--accent);
    stroke-width: 2.5;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  circle {
    stroke: var(--surface);
    stroke-width: 1.5;
  }
  .chosen {
    stroke: var(--text);
    stroke-width: 2.5;
  }
  .faded {
    opacity: 0.4;
  }
  .axis {
    font-size: 11px;
    fill: var(--text-2);
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
