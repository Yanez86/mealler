<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Drawing for a section's top bar, in the style of the Mealler mark (see Logo.svelte): an object tilted
     behind, an accent in front. Trends: a bar chart with a rising arrow. Favorites: a bowl with a star.
     Profile: a badge with a gear. Decorative: the page title says where you are. -->
<script lang="ts">
  let { section, size = 40 }: { section: 'trends' | 'favorites' | 'profile'; size?: number } = $props();

  const GEAR_TEETH = [0, 45, 90, 135, 180, 225, 270, 315];
</script>

<svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
  {#if section === 'trends'}
    <g transform="rotate(-12 50 54)">
      <rect x="14" y="22" width="72" height="70" rx="12" fill="#FFFFFF" />
      <rect x="23" y="60" width="11" height="22" rx="3" fill="#CDE8E3" />
      <rect x="38" y="46" width="11" height="36" rx="3" fill="#0F766E" />
      <rect x="53" y="54" width="11" height="28" rx="3" fill="#CDE8E3" />
      <rect x="68" y="32" width="11" height="50" rx="3" fill="#0F766E" />
      <line x1="22" y1="82" x2="80" y2="82" stroke="#14181D" stroke-width="4" stroke-linecap="round" />
      <rect x="14" y="22" width="72" height="70" rx="12" fill="none" stroke="#14181D" stroke-width="4" />
    </g>
    <g stroke-linecap="round" stroke-linejoin="round">
      <polyline points="50,104 68,86 80,96 101,73" fill="none" stroke="#14181D" stroke-width="16" />
      <polygon transform="translate(101 73) rotate(-47.5)" points="13,0 -5,-12 -5,12" fill="#14181D" stroke="#14181D" stroke-width="8" />
      <polyline points="50,104 68,86 80,96 101,73" fill="none" stroke="#E07A2E" stroke-width="8" />
      <polygon transform="translate(101 73) rotate(-47.5)" points="13,0 -5,-12 -5,12" fill="#E07A2E" />
      <line x1="56" y1="96" x2="64" y2="88" stroke="#F5A65B" stroke-width="3" />
    </g>
  {:else if section === 'favorites'}
    <g transform="translate(-2 -4) rotate(-10 50 58)">
      <path d="M20 50c1-15 14-24 30-24s29 9 30 24z" fill="#FFF4E0" stroke="#14181D" stroke-width="4" stroke-linejoin="round" />
      <circle cx="40" cy="40" r="5" fill="#E04F3F" stroke="#14181D" stroke-width="3" />
      <path d="M54 34c4-3 9-2 11 2c-4 3-9 2-11-2z" fill="#5BAA4A" stroke="#14181D" stroke-width="3" stroke-linejoin="round" />
      <rect x="38" y="80" width="24" height="10" rx="3" fill="#0F766E" stroke="#14181D" stroke-width="4" />
      <path d="M10 50h80c0 21-17 36-40 36S10 71 10 50z" fill="#0F766E" />
      <path d="M13 60h74" stroke="#CDE8E3" stroke-width="6" />
      <path d="M10 50h80c0 21-17 36-40 36S10 71 10 50z" fill="none" stroke="#14181D" stroke-width="4" stroke-linejoin="round" />
    </g>
    <g transform="translate(84 82) rotate(14)">
      <path
        d="M0 -30L8.23 -11.33L28.53 -9.27L13.31 4.33L17.63 24.27L0 14L-17.63 24.27L-13.31 4.33L-28.53 -9.27L-8.23 -11.33Z"
        fill="#F6C343"
        stroke="#14181D"
        stroke-width="4"
        stroke-linejoin="round" />
      <ellipse cx="-9" cy="-4" rx="4" ry="7" fill="#FBE08A" transform="rotate(-30 -9 -4)" />
    </g>
  {:else}
    <g transform="rotate(-12 50 56)">
      <rect x="12" y="28" width="76" height="60" rx="12" fill="#FFFFFF" />
      <path d="M12 40a12 12 0 0 1 12-12h52a12 12 0 0 1 12 12H12z" fill="#0F766E" />
      <circle cx="33" cy="58" r="8" fill="#0F766E" />
      <path d="M19 80c0-9 6-14 14-14s14 5 14 14z" fill="#0F766E" />
      <rect x="54" y="52" width="24" height="7" rx="3.5" fill="#CDE8E3" />
      <rect x="54" y="66" width="18" height="7" rx="3.5" fill="#CDE8E3" />
      <rect x="12" y="28" width="76" height="60" rx="12" fill="none" stroke="#14181D" stroke-width="4" />
      <rect x="42" y="16" width="16" height="20" rx="5" fill="#FFFFFF" stroke="#14181D" stroke-width="4" />
      <circle cx="50" cy="26" r="2.5" fill="#14181D" />
    </g>
    <g transform="translate(88 88) rotate(10)">
      <!-- Outline first, then the same shapes in orange on top, as for the drumstick bone in the logo. -->
      <g fill="#14181D" stroke="#14181D" stroke-width="8" stroke-linejoin="round">
        <circle r="16" />
        {#each GEAR_TEETH as angle (angle)}<rect x="-5.5" y="-25" width="11" height="12" rx="2" transform="rotate({angle})" />{/each}
      </g>
      <g fill="#E07A2E">
        <circle r="16" />
        {#each GEAR_TEETH as angle (angle)}<rect x="-5.5" y="-25" width="11" height="12" rx="2" transform="rotate({angle})" />{/each}
      </g>
      <ellipse cx="-7" cy="-8" rx="3" ry="5" fill="#F5A65B" transform="rotate(40 -7 -8)" />
      <circle r="6.5" fill="#FFF4E0" stroke="#14181D" stroke-width="4" />
    </g>
  {/if}
</svg>
