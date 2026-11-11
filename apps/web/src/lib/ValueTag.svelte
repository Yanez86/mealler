<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- The value of the bar or point chosen on a chart, in a small label just above it with a pointer.
     Kept inside the chart: near an edge it slides in, near the top it sits as high as it can. -->
<svelte:options namespace="svg" />

<script lang="ts">
  let { x, y, text, minX, maxX }: { x: number; y: number; text: string; minX: number; maxX: number } = $props();

  const height = 22;
  // About 7.5 px per character of 12 px bold digits, plus the rounded ends.
  const width = $derived(Math.max(36, text.length * 7.5 + 18));
  const left = $derived(Math.min(Math.max(x - width / 2, minX), maxX - width));
  const top = $derived(Math.max(1, y - 7 - height));
</script>

<g class="tag" aria-hidden="true">
  <rect x={left} y={top} {width} {height} rx={height / 2} />
  <path d="M{x - 5} {top + height - 0.5}l5 5.5l5 -5.5z" />
  <text x={left + width / 2} y={top + 15.5} text-anchor="middle">{text}</text>
</g>

<style>
  .tag rect,
  .tag path {
    fill: var(--text);
  }
  .tag text {
    fill: var(--surface);
    font-size: 12px;
    font-weight: 700;
  }
</style>
