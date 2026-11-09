<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Colored food-category icon, drawn in the style of the Mealler logo (files in static/food). -->
<!-- Decorative for screen readers (the food's name is always written next to it); the category is a tooltip. -->
<script module lang="ts">
  import type { FoodCategory } from '@mealler/shared';
  // Badge tint for each category, taken from the icon's main color.
  export const tints: Record<FoodCategory, string> = {
    fruit: '#E04F3F',
    vegetables: '#4E9E45',
    legumes: '#7CC36E',
    bread: '#D18B47',
    pasta: '#0F766E',
    pizza: '#F6C343',
    meat: '#E07A2E',
    fish: '#4D8FD1',
    eggs: '#F5B82E',
    dairy: '#F6C343',
    nuts: '#B97A47',
    fats: '#C9B83A',
    sweets: '#F27BA5',
    coffee: '#8A5530',
    drinks: '#F7A440',
    alcohol: '#A62B4D',
    other: '#0F766E'
  };
</script>

<script lang="ts">
  import { t } from './state.svelte';

  let { category, size = 40, badge = true }: { category: FoodCategory; size?: number; badge?: boolean } = $props();
</script>

<span
  class="food-icon"
  class:badge
  style:--tint={tints[category]}
  style:width="{size}px"
  style:height="{size}px"
  title={t(`food.${category}`)}
  aria-hidden="true">
  <img src="/food/{category}.svg" alt="" draggable="false" />
</span>

<style>
  .food-icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .badge {
    border-radius: 50%;
    background: color-mix(in srgb, var(--tint) var(--food-tint, 16%), transparent);
  }
  img {
    width: 100%;
    height: 100%;
    display: block;
    user-select: none;
  }
  .badge img {
    width: 76%;
    height: 76%;
  }
</style>
