<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Small picture of a nutrient (files in static/nutrients): a flame for calories, a steak for protein
     (two beans with "Meat-free"), an ear of wheat, a drop of oil, a leaf. Decorative: the label says it. -->
<script lang="ts">
  import type { Nutrient } from '@mealler/shared';
  import { app } from './state.svelte';

  let { nutrient, size = 20 }: { nutrient: Nutrient; size?: number } = $props();

  const file = $derived(nutrient === 'protein' && app.meatFree ? 'protein-veg' : nutrient);
</script>

<img class="nutrient-icon" src="/nutrients/{file}.svg" alt="" width={size} height={size} draggable="false" />

<style>
  .nutrient-icon {
    flex: none;
    display: inline-block;
    vertical-align: middle;
    user-select: none;
  }
</style>
