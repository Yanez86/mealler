<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start-up screen: logo, name and what the app is doing, over a tilted lattice of the food-category icons. -->
<!-- At the bottom: the spinning chicken leg, the version and the maker. -->
<script lang="ts">
  import { FOOD_CATEGORIES } from '@mealler/shared';
  import Logo from './Logo.svelte';
  import { tints } from './FoodIcon.svelte';

  let { message, version }: { message: string; version: string } = $props();

  // ponytail: 18 columns cover screens up to about 1300 px wide, and 3 cycles up to about 1280 px tall; raise them for bigger ones.
  const COLS = 18;
  const ROWS = FOOD_CATEGORIES.length * 3; // each column slides by one cycle, so 3 never leave a gap
  // Each row shifts by 5 categories, so the same icon never sits next to itself.
  const columns = Array.from({ length: COLS }, (_, c) =>
    Array.from({ length: ROWS }, (_, r) => FOOD_CATEGORIES[(c + r * 5) % FOOD_CATEGORIES.length])
  );
</script>

<div class="splash" role="status" aria-live="polite">
  <div class="lattice" aria-hidden="true">
    {#each columns as column, ci (ci)}
      <div class="col">
        {#each column as c, i (i)}
          <span class="tile" style:--tint={tints[c]}><img src="/food/{c}.svg" alt="" draggable="false" /></span>
        {/each}
      </div>
    {/each}
  </div>
  <div class="mark"><Logo size={112} title="Mealler" /></div>
  <!-- Wordmark drawn in strokes like the food icons; the two l are a fork and a knife. -->
  <svg class="name" viewBox="-6 -12 336 80" role="img" aria-label="Mealler" fill="none" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">
    <g stroke="var(--text)">
      <path d="M6 60V20M6 32a12 12 0 0 1 24 0V60M30 32a12 12 0 0 1 24 0V60M72 40H112A20 20 0 1 0 106.1 54.1M169 40a20 20 0 1 0 -40 0a20 20 0 1 0 40 0M169 20V60" />
      <path transform="translate(16)" d="M229 40H269A20 20 0 1 0 263.1 54.1M289 60V20M289 38a18 18 0 0 1 18 -18" />
    </g>
    <g stroke="var(--accent)" transform="translate(6)">
      <path d="M181 -6V10a8 8 0 0 0 16 0V-6M189 -6V12" stroke-width="5" />
      <path d="M189 19V60M215 36V60" />
      <path d="M209.5 36V0C209.5 -7 214 -9 217 -5C222 3 224 18 223 36Z" fill="var(--accent)" stroke-width="2" />
    </g>
  </svg>
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
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 8px;
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
  /* Columns slide by one cycle of the 17 categories (17 × 68 px), every other one the opposite way. */
  .col {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: up 100s linear infinite;
  }
  .col:nth-child(even) {
    animation-name: down;
  }
  .tile {
    width: 60px;
    height: 60px;
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
    width: 176px;
    height: auto;
    display: block;
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
  @keyframes up {
    from {
      transform: translateY(578px);
    }
    to {
      transform: translateY(-578px);
    }
  }
  @keyframes down {
    from {
      transform: translateY(-578px);
    }
    to {
      transform: translateY(578px);
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
