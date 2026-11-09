<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { NUTRIENTS, NUTRIENT_UNITS, type Nutrient, type Threshold } from '@mealler/shared';
  import { get, put } from '$lib/api';
  import { app, errorMessage, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  type Row = { min: string; max: string };
  let rows = $state<Record<Nutrient, Row>>({
    kcal: { min: '', max: '' },
    protein: { min: '', max: '' },
    carbs: { min: '', max: '' },
    fat: { min: '', max: '' },
    fiber: { min: '', max: '' }
  });
  let error = $state('');
  let saved = $state(false);

  const toText = (n: number | null) => (n == null ? '' : String(n).replace('.', app.locale === 'it' ? ',' : '.'));
  const toNumber = (s: string): number | null => {
    const v = s.trim().replace(',', '.');
    if (!v) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  onMount(async () => {
    try {
      const list = await get<Threshold[]>('/thresholds');
      for (const th of list) rows[th.nutrient] = { min: toText(th.min), max: toText(th.max) };
    } catch (e) {
      error = errorMessage(e);
    }
  });

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    saved = false;
    const items = NUTRIENTS.map((nutrient) => ({
      nutrient,
      min: toNumber(rows[nutrient].min),
      max: toNumber(rows[nutrient].max)
    }));
    if (items.some((i) => i.min != null && i.max != null && i.min > i.max)) {
      error = t('thresholds.invalid');
      return;
    }
    try {
      await put('/thresholds', { items });
      saved = true;
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>{t('thresholds.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('thresholds.title')}>
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  <p class="muted">{t('thresholds.intro')}</p>

  <form class="stack" onsubmit={save}>
    {#each NUTRIENTS as n (n)}
      <fieldset class="card">
        <legend class="label">{t(`nutrient.${n}`)} <span class="muted small">({NUTRIENT_UNITS[n]})</span></legend>
        <div class="pair">
          <div class="field">
            <label for="min-{n}">{t('thresholds.min')}</label>
            <input id="min-{n}" inputmode="decimal" autocomplete="off" bind:value={rows[n].min} />
          </div>
          <div class="field">
            <label for="max-{n}">{t('thresholds.max')}</label>
            <input id="max-{n}" inputmode="decimal" autocomplete="off" bind:value={rows[n].max} />
          </div>
        </div>
      </fieldset>
    {/each}
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saved}<p class="notice" role="status">{t('common.saved')}</p>{/if}
    <button class="btn btn-primary btn-block" type="submit">{t('common.save')}</button>
  </form>
</main>

<style>
  fieldset {
    margin: 0;
  }
  legend {
    float: left;
    width: 100%;
    padding: 0;
    margin-bottom: 12px;
  }
  .pair {
    clear: both;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
</style>
