<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Food category of a meal or library food: automatic (guessed from the name) or chosen from the icons. -->
<script lang="ts">
  import { FOOD_CATEGORIES, type FoodCategory } from '@mealler/shared';
  import { t } from './state.svelte';
  import FoodIcon from './FoodIcon.svelte';
  import Icon from './Icon.svelte';

  let { value = $bindable(null), auto }: { value?: FoodCategory | null; auto: FoodCategory } = $props();

  let open = $state(false);
  const shown = $derived(value ?? auto);

  function pick(next: FoodCategory | null) {
    value = next;
    open = false;
  }
</script>

<details class="card picker" bind:open>
  <summary>
    <FoodIcon category={shown} size={40} />
    <span class="grow">
      <span class="label">{t('category.label')}</span>
      <span class="muted small line">{t(`food.${shown}`)} · {value ? t('category.chosen') : t('category.auto')}</span>
    </span>
    <Icon name="chevron" size={20} />
  </summary>
  <div class="options" role="group" aria-label={t('category.choose')}>
    <button type="button" class="option" aria-pressed={value === null} onclick={() => pick(null)}>
      <span class="auto"><FoodIcon category={auto} size={40} /><span class="spark"><Icon name="sparkle" size={14} stroke={2.5} /></span></span>
      <span class="name">{t('category.auto')}</span>
    </button>
    {#each FOOD_CATEGORIES as c (c)}
      <button type="button" class="option" aria-pressed={value === c} onclick={() => pick(c)}>
        <FoodIcon category={c} size={40} />
        <span class="name">{t(`food.${c}`)}</span>
      </button>
    {/each}
  </div>
</details>

<style>
  .picker {
    padding: 0;
  }
  summary {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 64px;
    padding: 10px 16px 10px 14px;
    cursor: pointer;
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  /* Same chevron as the nutritional values panel: down when closed, up when open. */
  summary > :global(svg) {
    flex: none;
    color: var(--text-2);
    transform: rotate(90deg);
    transition: transform 150ms;
  }
  details[open] summary > :global(svg) {
    transform: rotate(-90deg);
  }
  .grow {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 8px;
    padding: 4px 12px 14px;
  }
  .option {
    min-height: 88px;
    padding: 8px 4px;
    border: 1.5px solid transparent;
    border-radius: 16px;
    background: transparent;
    color: var(--text);
    font: inherit;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .option[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
  }
  .option[aria-pressed='true'] .name {
    color: var(--accent-ink);
  }
  .auto {
    position: relative;
    display: inline-flex;
  }
  .spark {
    position: absolute;
    right: -4px;
    top: -4px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
