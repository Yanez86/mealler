<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { ACHIEVEMENTS, ACHIEVEMENT_FAMILIES, type AchievementState } from '@mealler/shared';
  import { get } from '$lib/api';
  import { app, errorMessage, t } from '$lib/state.svelte';
  import AchievementIcon from '$lib/AchievementIcon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let states = $state<Record<string, AchievementState>>({});
  let error = $state('');

  $effect(() => {
    get<AchievementState[]>('/achievements')
      .then((list) => (states = Object.fromEntries(list.map((s) => [s.id, s]))))
      .catch((e) => (error = errorMessage(e)));
  });

  const loaded = $derived(Object.keys(states).length > 0);
  const unlocked = $derived(ACHIEVEMENTS.filter((a) => states[a.id]?.at));
  const count = (tier: string) => unlocked.filter((a) => a.tier === tier).length;
  // Up next: the locked one with a count that is closest to done.
  const next = $derived(
    ACHIEVEMENTS.filter((a) => a.target > 1 && !states[a.id]?.at && states[a.id]?.progress)
      .sort((a, b) => states[b.id].progress / b.target - states[a.id].progress / a.target)[0]
  );
  const R = 26;
  const C = 2 * Math.PI * R;
  const pct = (id: string, target: number) => `${((states[id]?.progress ?? 0) / target) * 100}%`;
  const day = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString(app.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const TIERS = [['gold', '#F6C343'], ['silver', '#AEB8C3'], ['bronze', '#C98A4B']] as const;
</script>

<svelte:head><title>{t('ach.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('ach.title')} section="profile" />

  {#if error}
    <p class="error" role="alert">{error}</p>
  {:else if loaded}
    <section class="card summary">
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={R} fill="none" stroke="var(--surface-2)" stroke-width="8" />
        <circle class="arc" style:--C={C} cx="32" cy="32" r={R} fill="none" stroke="var(--accent)" stroke-width="8"
          stroke-linecap="round" stroke-dasharray="{(C * unlocked.length) / ACHIEVEMENTS.length} {C}" transform="rotate(-90 32 32)" />
      </svg>
      <div>
        <b>{t('ach.unlocked', { n: unlocked.length, total: ACHIEVEMENTS.length })}</b>
        <span class="muted">{t('ach.unlockedLabel')}</span>
        <div class="medals">
          {#each TIERS as [tier, color] (tier)}
            <span title={t(`ach.tier.${tier}`)}><i style:background={color}></i>{count(tier)}</span>
          {/each}
        </div>
      </div>
    </section>

    {#if next}
      <section class="card next">
        <AchievementIcon id={next.id} size={56} locked />
        <div>
          <small>{t('ach.next')}</small>
          <p>{t(`ach.${next.id}` as never)} · {states[next.id].progress}/{next.target}</p>
          <div class="bar"><div style:width={pct(next.id, next.target)}></div></div>
        </div>
      </section>
    {/if}

    {#each ACHIEVEMENT_FAMILIES as family (family)}
      <h2 class="section-title fam">{t(`ach.fam.${family}`)}</h2>
      <ul class="grid">
        {#each ACHIEVEMENTS.filter((a) => a.family === family) as a (a.id)}
          {@const s = states[a.id]}
          <li class="tile" class:locked={!s?.at} title={t(`ach.${a.id}.how` as never)}>
            <AchievementIcon id={a.id} size={62} locked={!s?.at} />
            <span class="name">{t(`ach.${a.id}` as never)}</span>
            {#if s?.at}
              <span class="when">{day(s.at)}</span>
            {:else if a.target > 1 && s?.progress}
              <span class="mini"><span style:width={pct(a.id, a.target)}></span></span>
              <span class="when">{s.progress}/{a.target}</span>
            {:else}
              <span class="when">{t('ach.todo')}</span>
            {/if}
            <span class="visually-hidden">{t(`ach.${a.id}.how` as never)}</span>
          </li>
        {/each}
      </ul>
    {/each}
  {:else}
    <p class="muted">{t('common.loading')}</p>
  {/if}
</main>

<style>
  .summary {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px;
    align-items: center;
  }
  .ring {
    width: 64px;
    height: 64px;
  }
  .summary b {
    display: block;
    font-size: 22px;
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }
  .medals {
    display: flex;
    gap: 10px;
    margin-top: 6px;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .medals i {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    margin-right: 4px;
    vertical-align: -1px;
    border: 1.5px solid #14181d;
  }
  .next {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 12px;
    align-items: center;
  }
  .next small {
    color: var(--text-2);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .next p {
    margin: 2px 0 8px;
    font-weight: 600;
  }
  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--surface-2);
    overflow: hidden;
  }
  .bar > div,
  .mini > span {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: inherit;
    animation: grow 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) 0.25s both;
  }
  .mini > span {
    animation-delay: 0.5s;
  }
  .arc {
    animation: arc 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) 0.15s both;
  }
  @keyframes grow {
    from {
      width: 0;
    }
  }
  @keyframes arc {
    from {
      stroke-dasharray: 0 var(--C);
    }
  }
  /* With reduced motion the bars and ring are drawn full at once (the global rule in app.css stops animations). */
  .fam {
    margin-bottom: -4px;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }
  .tile {
    background: var(--surface);
    border-radius: 16px;
    padding: 12px 6px 10px;
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 6px;
    text-align: center;
  }
  .name {
    font-size: 12px;
    font-weight: 600;
    line-height: 1.25;
  }
  .locked .name,
  .when {
    color: var(--text-2);
  }
  .when {
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }
  .mini {
    width: 70%;
    height: 4px;
    border-radius: 2px;
    background: var(--surface-2);
    overflow: hidden;
  }
</style>
