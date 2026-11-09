<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start-up screen: logo, name and what the app is doing, over a tilted lattice of the food-category icons. -->
<!-- At the bottom: the spinning chicken leg, the version and the maker. -->
<script lang="ts">
  import { FOOD_CATEGORIES } from '@mealler/shared';
  import Logo from './Logo.svelte';
  import { tints } from './FoodIcon.svelte';

  let { message, version }: { message: string; version: string } = $props();

  // ponytail: fixed 18×26 lattice covers screens up to about 1300 px wide once tilted; raise COLS for wider ones.
  const COLS = 18;
  const ROWS = 26;
  // Each row shifts by 5 categories, so the same icon never stacks in a column.
  const tiles = Array.from({ length: COLS * ROWS }, (_, i) => {
    const r = Math.floor(i / COLS);
    return FOOD_CATEGORIES[((i % COLS) + r * 5) % FOOD_CATEGORIES.length];
  });
</script>

<div class="splash" role="status" aria-live="polite">
  <div class="lattice" style:--cols={COLS} aria-hidden="true">
    {#each tiles as c, i (i)}
      <span class="tile" style:--tint={tints[c]}><img src="/food/{c}.svg" alt="" draggable="false" /></span>
    {/each}
  </div>
  <div class="mark"><Logo size={112} title="Mealler" /></div>
  <p class="name">Mealler</p>
  <p class="message">{message}</p>
  <div class="foot">
    <img class="leg" src="/food/meat.svg" alt="" width="34" height="34" draggable="false" />
    <p class="version">v{version}</p>
    <p class="maker">Happy Squid inc</p>
  </div>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    background: var(--bg);
    text-align: center;
    overflow: hidden;
    isolation: isolate;
  }
  /* Tilted the opposite way of the logo's calendar (-12deg). */
  .lattice {
    position: absolute;
    inset: -40%;
    z-index: -1;
    display: grid;
    grid-template-columns: repeat(var(--cols), 60px);
    grid-auto-rows: 60px;
    gap: 8px;
    place-content: center;
    transform: rotate(12deg);
    opacity: 0.35;
    animation: fade 900ms ease-out both;
  }
  /* Fades the lattice out toward the bottom: drawn after it, still below the logo and text. */
  .splash::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(to bottom, transparent 35%, var(--bg) 100%);
    pointer-events: none;
  }
  .tile {
    border-radius: 23%;
    background: color-mix(in srgb, var(--tint) 22%, var(--surface));
    display: grid;
    place-items: center;
  }
  .tile img {
    width: 62%;
    height: 62%;
    display: block;
    user-select: none;
  }
  .mark {
    width: 152px;
    height: 152px;
    border-radius: 36px;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.12);
    animation: pop 600ms ease-out both;
  }
  .name {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .message {
    margin-top: 20px;
    min-height: 22px;
    font-size: 15px;
    color: var(--text-2);
  }
  .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 18px 24px calc(30px + env(safe-area-inset-bottom, 0px));
  }
  .leg {
    display: block;
    animation: spin 1.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  }
  .version {
    font-size: 15px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .maker {
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text-2);
    opacity: 0.8;
  }
  @keyframes pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
