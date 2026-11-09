<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Amount plus a unit tag (g, ml, unità, confezione, cucchiaio, cucchiaino; oz, fl oz, cup in US units). -->
<script lang="ts">
  import { SYSTEM_UNITS, unitLabel, type QuantityUnit, type UnitSystem } from '@mealler/shared';
  import { app, t } from './state.svelte';

  let {
    id,
    amount = $bindable(''),
    unit = $bindable('g'),
    units,
    label
  }: { id: string; amount?: string; unit?: QuantityUnit; units: UnitSystem; label: string } = $props();

  // The tags of the user's system, plus the unit already in use if it comes from the other one
  // (a food typed as "100 g" by someone using US units keeps its grams).
  const choices = $derived(SYSTEM_UNITS[units].includes(unit) ? SYSTEM_UNITS[units] : [unit, ...SYSTEM_UNITS[units]]);
</script>

<!-- Amount and unit tags flow on the same lines, so a row stays short. -->
<div class="quantity" role="group" aria-label={label}>
  <label class="visually-hidden" for={id}>{label}</label>
  <input {id} class="input amount" inputmode="decimal" autocomplete="off" placeholder={t('entry.quantity')} bind:value={amount} />
  {#each choices as u (u)}
    <button type="button" class="chip" aria-pressed={unit === u} aria-label="{unitLabel(u, app.locale)}, {t('entry.unit')}" onclick={() => (unit = u)}>{unitLabel(u, app.locale)}</button>
  {/each}
</div>

<style>
  /* The tags wrap instead of scrolling, so every unit is in sight. */
  .quantity {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .amount {
    width: 96px;
    min-height: 44px;
  }
  .chip {
    min-height: 40px;
    padding: 0 12px;
    font-size: 14px;
  }
</style>
