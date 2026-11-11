<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { NUTRIENTS, NUTRIENT_UNITS, type Nutrient, type Threshold, type User } from '@mealler/shared';
  import { get, patch, put } from '$lib/api';
  import { app, errorMessage, parseNumber, setUser, t } from '$lib/state.svelte';
  import { glassFrom, glassIn, glassUnit, goalFrom, goalIn, goalUnit } from '$lib/water';
  import Icon from '$lib/Icon.svelte';
  import NutrientIcon from '$lib/NutrientIcon.svelte';
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
  const toNumber = (s: string): number | null => parseNumber(s) ?? null;

  // Water: goal and glass are kept in ml, typed in litres and ml (or fl oz with US units).
  let waterEnabled = $state(app.user?.waterEnabled ?? true);
  let waterGoal = $state(toText(goalIn(app.user?.waterGoalMl ?? 2000)));
  let waterGlass = $state(toText(glassIn(app.user?.waterGlassMl ?? 250)));

  onMount(async () => {
    try {
      const list = await get<Threshold[]>('/thresholds');
      for (const th of list) rows[th.nutrient] = { min: toText(th.min), max: toText(th.max) };
    } catch (e) {
      error = errorMessage(e);
    }
  });

  let notice = $state('');

  /** Fills the form with the SINU LARN reference values for adults, derived from calories and body weight. */
  async function recommended() {
    error = notice = '';
    const kcalMax = toNumber(rows.kcal.max);
    const kcalMin = toNumber(rows.kcal.min);
    const kcal = kcalMax ?? kcalMin;
    if (kcal == null) {
      error = t('thresholds.needKcal');
      return;
    }
    const pct = (share: number, perGram: number) => Math.round((kcal * share) / perGram);
    rows.carbs = { min: toText(pct(0.45, 4)), max: toText(pct(0.6, 4)) };
    rows.fat = { min: toText(pct(0.2, 9)), max: toText(pct(0.35, 9)) };
    rows.fiber = { min: '25', max: rows.fiber.max };
    try {
      const { last } = await get<{ last: { kg: number } | null }>('/weights/last');
      if (last) rows.protein = { min: toText(Math.round(last.kg * 0.9)), max: rows.protein.max };
      notice = last ? t('thresholds.filled') : `${t('thresholds.filled')} ${t('thresholds.needWeight')}`;
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    saved = false;
    const items = NUTRIENTS.map((nutrient) => ({
      nutrient,
      min: toNumber(rows[nutrient].min),
      max: toNumber(rows[nutrient].max)
    }));
    if (NUTRIENTS.some((n) => parseNumber(rows[n].min) === undefined || parseNumber(rows[n].max) === undefined)) {
      error = t('error.number');
      return;
    }
    if (items.some((i) => i.min != null && i.max != null && i.min > i.max)) {
      error = t('thresholds.invalid');
      return;
    }
    const goal = toNumber(waterGoal);
    const glass = toNumber(waterGlass);
    const goalMl = goal == null ? null : goalFrom(goal);
    const glassMl = glass == null ? null : glassFrom(glass);
    if (goalMl == null || glassMl == null || goalMl < 200 || goalMl > 10000 || glassMl < 20 || glassMl > 2000) {
      const goalText = (ml: number) => `${toText(goalIn(ml))} ${goalUnit()}`;
      const glassText = (ml: number) => `${toText(glassIn(ml))} ${glassUnit()}`;
      error = t('water.invalid', { goalMin: goalText(200), goalMax: goalText(10000), glassMin: glassText(20), glassMax: glassText(2000) });
      return;
    }
    try {
      await put('/thresholds', { items });
      setUser(await patch<User>('/me', { waterEnabled, waterGoalMl: goalMl, waterGlassMl: glassMl }));
      saved = true;
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>{t('thresholds.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('thresholds.title')} section="profile">
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  <p class="muted">{t('thresholds.intro')}</p>

  <section class="card stack">
    <button class="btn" type="button" onclick={recommended}>{t('thresholds.recommended')}</button>
    <p class="help">
      {t('thresholds.recommendedHelp')}
      <a href="https://eng.sinu.it/tabelle-larn-2014/" target="_blank" rel="noopener">SINU LARN</a>
    </p>
    {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  </section>

  <form class="stack" onsubmit={save}>
    {#each NUTRIENTS as n (n)}
      <fieldset class="card">
        <legend class="label"><NutrientIcon nutrient={n} size={22} />{t(`nutrient.${n}`)} <span class="muted small">({NUTRIENT_UNITS[n]})</span></legend>
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
    <fieldset class="card water">
      <legend class="label">{t('water.title')}</legend>
      <label class="check">
        <input type="checkbox" bind:checked={waterEnabled} />
        <span>{t('water.show')}</span>
      </label>
      <div class="pair">
        <div class="field">
          <label for="water-goal">{t('water.goal')} <span class="muted small">({goalUnit()})</span></label>
          <input id="water-goal" inputmode="decimal" autocomplete="off" bind:value={waterGoal} />
        </div>
        <div class="field">
          <label for="water-glass">{t('water.glass')} <span class="muted small">({glassUnit()})</span></label>
          <input id="water-glass" inputmode="decimal" autocomplete="off" bind:value={waterGlass} />
        </div>
      </div>
      <p class="help">{t('water.help')}</p>
    </fieldset>
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
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .water {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .water legend {
    margin-bottom: 0;
  }
  /* A label on two lines must not push its field down: the two fields stay level. */
  .water .pair {
    align-items: end;
  }
  .check {
    clear: both;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
  .check input {
    width: 22px;
    height: 22px;
    flex: none;
    accent-color: var(--accent);
  }
  .pair {
    clear: both;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
</style>
