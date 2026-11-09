<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Mealler mark: a tilted calendar with a chicken drumstick in front. -->
<script lang="ts">
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
</svg>
