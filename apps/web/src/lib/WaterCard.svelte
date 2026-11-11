<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Water of the day in the diary: a bottle that fills up towards the goal, "+ Glass" for each drink
     and "−" to take the last one off. A glass counts at once; the server's total follows. -->
<script lang="ts" module>
  let counter = 0;
</script>

<script lang="ts">
  import type { WaterDay } from '@mealler/shared';
  import { del, post } from './api';
  import Icon from './Icon.svelte';
  import { net } from './offline.svelte';
  import { errorMessage, t } from './state.svelte';
  import { waterText } from './water';

  let {
    date,
    ml,
    goal,
    glass,
    onchange
  }: { date: string; ml: number; goal: number; glass: number; onchange: (ml: number) => void } = $props();

  const clip = `water-clip-${++counter}`;
  let error = $state('');
  let removing = $state(false);
  // Glasses on their way to the server: until they all arrive, the total on screen is the one to trust.
  let sending = 0;

  const level = $derived(Math.min(1, goal > 0 ? ml / goal : 0));
  const done = $derived(ml >= goal);
  // The bottle's body runs from y = 96 (bottom) to about y = 30 (shoulders).
  const waterTop = $derived(96 - level * 66);

  async function add() {
    error = '';
    onchange(ml + glass);
    sending++;
    try {
      const res = await post<WaterDay>('/water', { date, ml: glass });
      if (--sending === 0) onchange(res.ml);
    } catch (e) {
      sending--;
      onchange(Math.max(0, ml - glass));
      error = errorMessage(e);
    }
  }

  async function removeLast() {
    if (removing || sending) return;
    removing = true;
    error = '';
    try {
      onchange((await del<WaterDay>(`/water/${date}/last`)).ml);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      removing = false;
    }
  }
</script>

<section class="card water" aria-labelledby="water-title">
  <svg class="bottle" width="64" height="100" viewBox="0 0 64 100" aria-hidden="true">
    <defs>
      <clipPath id={clip}>
        <path d="M24 16h16v8c0 4 12 8 12 18v44a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10V42c0-10 12-14 12-18z" />
      </clipPath>
    </defs>
    <path d="M24 16h16v8c0 4 12 8 12 18v44a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10V42c0-10 12-14 12-18z" fill="#FFFFFF" />
    <g clip-path="url(#{clip})">
      <g class="level" style:transform="translateY({waterTop}px)">
        <rect x="0" y="0" width="64" height="100" fill="#4D8FD1" />
        <rect x="0" y="0" width="64" height="4" fill="#7FB0E3" />
      </g>
    </g>
    <path d="M18 46v34" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="4" stroke-linecap="round" />
    <path d="M44 52h6M44 64h6M44 76h6" stroke="#14181D" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round" />
    <path
      d="M24 16h16v8c0 4 12 8 12 18v44a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10V42c0-10 12-14 12-18z"
      fill="none"
      stroke="#14181D"
      stroke-width="3"
      stroke-linejoin="round" />
    <rect x="21" y="4" width="22" height="13" rx="3" fill="#0F766E" stroke="#14181D" stroke-width="3" />
  </svg>

  <div class="info">
    <h2 id="water-title" class="label">{t('water.title')}</h2>
    <p aria-live="polite"><span class="big">{waterText(ml)}</span> <span class="muted">{t('water.of', { goal: waterText(goal) })}</span></p>
    <p class="small" class:muted={!done} class:done>
      {#if done}<Icon name="check" size={16} stroke={2.5} />{t('water.done')}{:else}{t('water.left', { amount: waterText(goal - ml) })}{/if}
    </p>
    <div class="actions">
      <button class="icon-btn" type="button" aria-label={t('water.removeLabel')} disabled={ml <= 0 || removing || !net.online} onclick={removeLast}>
        <Icon name="minus" size={20} stroke={2.5} />
      </button>
      <button class="btn btn-primary" type="button" aria-label={t('water.addLabel', { amount: waterText(glass) })} disabled={!net.online} onclick={add}>
        <Icon name="plus" size={20} stroke={2.5} />{t('water.add')}
      </button>
    </div>
    {#if !net.online}<p class="muted small">{t('water.offline')}</p>{/if}
    {#if error}<p class="error small" role="alert">{error}</p>{/if}
  </div>
</section>

<style>
  .water {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .bottle {
    flex: none;
  }
  .level {
    transition: transform 400ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .big {
    font-size: 26px;
    font-weight: 700;
    line-height: 32px;
  }
  .done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--accent-ink);
    font-weight: 600;
  }
  .actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }
  .actions .btn {
    flex: 1;
    min-height: 44px;
  }
  /* On the white card the round button needs its outline to read as a button. */
  .actions .icon-btn {
    border: 1.5px solid var(--field);
  }
  @media (prefers-reduced-motion: reduce) {
    .level {
      transition: none;
    }
  }
</style>
