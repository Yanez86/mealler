<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Mealler mark: a tilted calendar with a chicken drumstick in front (a carrot with "Meat-free"). -->
<script lang="ts">
  import { app } from './state.svelte';

  let { size = 40, title = '' }: { size?: number; title?: string } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 120 120" role={title ? 'img' : undefined} aria-label={title || undefined} aria-hidden={title ? undefined : 'true'}>
  <g transform="rotate(-12 50 54)">
    <rect x="14" y="22" width="72" height="70" rx="12" fill="#FFFFFF" />
    <path d="M14 34a12 12 0 0 1 12-12h48a12 12 0 0 1 12 12v10H14z" fill="#0F766E" />
    <rect x="24" y="54" width="12" height="12" rx="3" fill="#0F766E" />
    <rect x="43" y="54" width="12" height="12" rx="3" fill="#CDE8E3" />
    <rect x="62" y="54" width="12" height="12" rx="3" fill="#CDE8E3" />
    <rect x="24" y="72" width="12" height="12" rx="3" fill="#CDE8E3" />
    <rect x="43" y="72" width="12" height="12" rx="3" fill="#CDE8E3" />
    <line x1="14" y1="44" x2="86" y2="44" stroke="#14181D" stroke-width="4" />
    <rect x="14" y="22" width="72" height="70" rx="12" fill="none" stroke="#14181D" stroke-width="4" />
    <rect x="31" y="12" width="7" height="18" rx="3.5" fill="#14181D" />
    <rect x="62" y="12" width="7" height="18" rx="3.5" fill="#14181D" />
  </g>
  {#if app.meatFree}
  <g transform="translate(70 86) rotate(-40)">
    <g fill="#5BAA4A" stroke="#14181D" stroke-width="4" stroke-linejoin="round">
      <path d="M30 0C38 -10 48 -12 54 -9C50 -2 40 2 30 0Z" />
      <path d="M30 0C40 -2 50 4 52 10C44 12 36 8 30 0Z" />
      <path d="M30 0C36 -4 46 -2 50 2C44 4 36 3 30 0Z" fill="#7CC36A" />
    </g>
    <path d="M24 -12C31 -12 35 -6 35 0C35 6 31 12 24 12L-30 4C-34 3.4 -34 -3.4 -30 -4Z" fill="#E07A2E" stroke="#14181D" stroke-width="4" stroke-linejoin="round" />
    <path d="M-12 -4.5L-10 1M2 -7.5L4 -1M14 -9.5L16 -3M8 3L10 8.5" stroke="#14181D" stroke-width="3" stroke-linecap="round" />
    <ellipse cx="14" cy="-5" rx="9" ry="2.6" fill="#F5A65B" transform="rotate(-6 14 -5)" />
  </g>
  {:else}
  <g transform="translate(66 88) rotate(-38)">
    <g fill="#14181D" stroke="#14181D" stroke-width="8" stroke-linejoin="round">
      <circle cx="42" cy="-6.5" r="7.5" />
      <circle cx="42" cy="6.5" r="7.5" />
      <rect x="14" y="-5" width="30" height="10" />
    </g>
    <g fill="#FFF4E0">
      <circle cx="42" cy="-6.5" r="7.5" />
      <circle cx="42" cy="6.5" r="7.5" />
      <rect x="14" y="-5" width="30" height="10" />
    </g>
    <path
      d="M22 -5C14 -8 10 -20 -6 -19C-22 -18 -28 -4 -24 8C-20 19 -4 22 8 14C13 10 16 7 22 5Z"
      fill="#E07A2E"
      stroke="#14181D"
      stroke-width="4"
      stroke-linejoin="round" />
    <ellipse cx="-9" cy="-9" rx="8" ry="4.5" fill="#F5A65B" transform="rotate(-20 -9 -9)" />
  </g>
  {/if}
</svg>
