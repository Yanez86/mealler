<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- One food in the add-meal screen: name, quantity with unit tags, its own values and its own estimate. -->
<script lang="ts">
  import { kcalMismatch, mealCategory, type Nutrient, type UnitSystem } from '@mealler/shared';
  import { app, formatNumber, t } from './state.svelte';
  import { hasValues, rowValues, type FoodRow } from './foodRow';
  import CategoryPicker from './CategoryPicker.svelte';
  import FoodIcon from './FoodIcon.svelte';
  import Icon from './Icon.svelte';
  import QuantityInput from './QuantityInput.svelte';

  let {
    row = $bindable(),
    index,
    units,
    removable,
    canEstimate,
    onestimate,
    onremove,
    onsplit
  }: {
    row: FoodRow;
    index: number;
    units: UnitSystem;
    removable: boolean;
    canEstimate: boolean;
    onestimate: () => void;
    onremove: () => void;
    onsplit: () => void;
  } = $props();

  const nutrients: { key: Nutrient; unit: string }[] = [
    { key: 'kcal', unit: 'kcal' },
    { key: 'protein', unit: 'g' },
    { key: 'carbs', unit: 'g' },
    { key: 'fat', unit: 'g' },
    { key: 'fiber', unit: 'g' }
  ];

  let open = $state(false);
  const parsed = $derived(rowValues(row));
  const mismatch = $derived(kcalMismatch(parsed));
  const auto = $derived(mealCategory([row.name], row.items));
  const label = $derived(row.name.trim() || t('entry.foodN', { n: index + 1 }));
  const summary = $derived(
    !hasValues(row)
      ? t('entry.valuesEmpty')
      : [
          parsed.kcal != null ? `${formatNumber(parsed.kcal)} kcal` : null,
          parsed.protein != null ? `${t('entry.shortProtein')} ${formatNumber(parsed.protein, 1)} g` : null,
          parsed.carbs != null ? `${t('entry.shortCarbs')} ${formatNumber(parsed.carbs, 1)} g` : null,
          parsed.fat != null ? `${t('entry.shortFat')} ${formatNumber(parsed.fat, 1)} g` : null
        ]
          .filter(Boolean)
          .join(' · ')
  );

  /** The name box grows with its text, so long descriptions stay readable. */
  function autogrow(node: HTMLTextAreaElement, _value: string) {
    const fit = () => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + node.offsetHeight - node.clientHeight}px`;
    };
    fit();
    node.addEventListener('input', fit);
    return {
      // After the new text is in the box.
      update: () => requestAnimationFrame(fit),
      destroy: () => node.removeEventListener('input', fit)
    };
  }

  // Enter splits the text into foods instead of sending the form.
  function keydown(e: KeyboardEvent) {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
    e.preventDefault();
    onsplit();
  }
</script>

<div class="card food" aria-busy={row.estimating}>
  <div class="head">
    <span class="icon"><FoodIcon category={row.category ?? auto} size={36} badge={false} /></span>
    <label class="visually-hidden" for="food-{row.key}">{t('entry.foodN', { n: index + 1 })}</label>
    <textarea
      id="food-{row.key}"
      class="input name"
      rows="1"
      maxlength="1000"
      placeholder={index === 0 ? t('entry.foodPlaceholder') : ''}
      bind:value={row.name}
      onchange={onsplit}
      onkeydown={keydown}
      use:autogrow={row.name}></textarea>
    {#if removable}
      <button class="icon-btn plain" type="button" aria-label={t('entry.removeFood', { name: label })} onclick={onremove}>
        <Icon name="close" />
      </button>
    {/if}
  </div>

  <QuantityInput id="qty-{row.key}" label={t('entry.quantity')} {units} bind:amount={row.amount} bind:unit={row.unit} />
  {#if row.legacyQuantity && !row.amount.trim()}
    <p class="help">{t('entry.savedQuantity', { q: row.legacyQuantity })}</p>
  {/if}

  <div class="foot">
    <details class="values" bind:open>
      <summary>
        <span class="grow">
          <span class="label">{t('entry.values')}</span>
          <span class="muted small line">{summary}</span>
        </span>
        <Icon name="chevron" size={20} />
      </summary>
      <div class="stack body">
        <div class="grid">
          {#each nutrients as n (n.key)}
            <div class="field">
              <label for="v-{row.key}-{n.key}">{t(`nutrient.${n.key}`)} <span class="muted small">({n.unit})</span></label>
              <input id="v-{row.key}-{n.key}" inputmode="decimal" autocomplete="off" bind:value={row.values[n.key]} />
            </div>
          {/each}
        </div>
        {#if row.items && row.items.length > 1}
          <ul class="breakdown">
            {#each row.items as item, i (i)}
              <li>
                <span class="grow">{item.name}{#if item.quantity} · {item.quantity}{/if}</span>
                <span class="muted">{formatNumber(item.kcal)} kcal</span>
              </li>
            {/each}
          </ul>
        {/if}
        {#if row.estimate}
          <p class="help">
            <Icon name="sparkle" size={14} />
            {t(`ai.confidence.${row.estimate.confidence}`)}{#if row.estimate.notes} — {row.estimate.notes}{/if}
          </p>
        {/if}
        <CategoryPicker bind:value={row.category} {auto} />
      </div>
    </details>
    {#if canEstimate}
      <button
        class="btn btn-ghost estimate"
        type="button"
        aria-label={t('entry.estimateFood', { name: label })}
        disabled={row.estimating || !row.name.trim()}
        onclick={onestimate}>
        <Icon name="sparkle" size={20} />{row.estimatedValues ? t('ai.recalculate') : t('ai.calculate')}
      </button>
    {/if}
  </div>

  {#if row.estimating}
    <p class="notice working" role="status"><Icon name="sparkle" size={18} />{t('ai.working')}</p>
  {:else if row.estimatedValues}
    <p class="help"><Icon name="alert" size={16} /> {t('ai.editHint')}</p>
  {/if}
  {#if mismatch}
    <p class="warn" role="status"><Icon name="alert" size={18} />{t('entry.mismatch')}</p>
  {/if}
</div>

<style>
  .food {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 12px 12px 14px;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .icon {
    flex: none;
    display: flex;
    margin-top: 6px;
  }
  .name {
    flex: 1;
    min-width: 0;
    min-height: 48px;
    resize: none;
    overflow: hidden;
    line-height: 1.4;
    font-weight: 600;
  }
  .foot {
    display: flex;
    align-items: flex-start;
    gap: 4px;
  }
  .values {
    flex: 1;
    min-width: 0;
  }
  .values summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    cursor: pointer;
    list-style: none;
  }
  .values summary::-webkit-details-marker {
    display: none;
  }
  .values summary .grow {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .line {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .values summary > :global(svg) {
    flex: none;
    color: var(--text-2);
    transform: rotate(90deg);
    transition: transform 150ms;
  }
  .values[open] summary > :global(svg) {
    transform: rotate(-90deg);
  }
  .body {
    padding-top: 8px;
  }
  .estimate {
    flex: none;
    padding: 0 12px;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .breakdown {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 15px;
  }
  .breakdown li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .working {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .warn {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    color: var(--over-ink);
    font-size: 15px;
    font-weight: 500;
  }
</style>
