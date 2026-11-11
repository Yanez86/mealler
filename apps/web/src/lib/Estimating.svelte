<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Sto stimando…" with a spinning chicken leg (a carrot with "Meat-free"), while Claude estimates a meal. -->
<script lang="ts">
  import { app, t } from './state.svelte';

  let { size = 20 }: { size?: number } = $props();
</script>

<span class="estimating">
  <img class="leg" src={app.meatFree ? '/carrot.svg' : '/food/meat.svg'} alt="" width={size} height={size} draggable="false" />
  {t('ai.working')}
</span>

<style>
  .estimating {
    display: inline-flex;
    align-items: center;
    gap: 0.45em;
  }
  .leg {
    flex: none;
    animation: spin 1.2s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  /* With reduced motion the leg stays still (the global rule in app.css stops every animation). */
</style>
