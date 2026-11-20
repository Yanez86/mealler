<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A meal off the diary, as a sheet from the bottom: how much it was, roughly (a plate filling up), and
     a note, both optional. Opens from a marked meal (to change or remove the mark) or from the meal
     page. The meal counts as filled; the day's totals stay partial and out of the averages. -->
<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { UNTRACKED_SIZES, type Untracked, type UntrackedSize } from '@mealler/shared';
  import { t } from './state.svelte';
  import Icon from './Icon.svelte';

  let {
    slot,
    current,
    onsave,
    onremove,
    onclose
  }: {
    slot: string;
    current: Untracked | null;
    onsave: (value: Untracked) => void;
    onremove: () => void;
    onclose: () => void;
  } = $props();

  let size = $state<UntrackedSize | null>(untrack(() => current?.size ?? null));
  let note = $state(untrack(() => current?.note ?? ''));
  let dialog = $state<HTMLDivElement | null>(null);

  // The food on the plate, from a bite to a full plate (radius in a 30 px box, plate 13).
  const portion: Record<UntrackedSize, number> = { light: 3.5, normal: 6, large: 8.5, huge: 11 };

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsave({ size, note: note.trim() || null });
  }

  onMount(() => dialog?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="backdrop" type="button" tabindex="-1" aria-label={t('common.close')} onclick={onclose}></button>
<div
  bind:this={dialog}
  class="sheet"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-labelledby="untracked-title"
  aria-describedby="untracked-sub">
  <form class="stack" onsubmit={submit}>
    <span class="grab" aria-hidden="true"></span>
    <div class="head">
      <span class="badge" aria-hidden="true"><Icon name="unseen" size={22} stroke={2.2} /></span>
      <div class="grow">
        <h2 id="untracked-title">{t('untracked.title', { slot })}</h2>
        <p id="untracked-sub" class="muted small">{t('untracked.subtitle')}</p>
      </div>
      <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={onclose}>
        <Icon name="close" />
      </button>
    </div>

    <fieldset>
      <legend class="label">{t('untracked.size')} <span class="muted optional">({t('common.optional')})</span></legend>
      <div class="sizes">
        {#each UNTRACKED_SIZES as s (s)}
          <button class="size" type="button" aria-pressed={size === s} onclick={() => (size = size === s ? null : s)}>
            <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
              <circle cx="15" cy="15" r="13" fill="none" stroke="currentColor" stroke-width="1.8" />
              <circle cx="15" cy="15" r={portion[s]} fill="currentColor" />
            </svg>
            <span>{t(`untracked.size.${s}`)}</span>
          </button>
        {/each}
      </div>
    </fieldset>

    <div class="field">
      <label for="untracked-note">{t('untracked.note')} <span class="muted optional">({t('untracked.noteOptional')})</span></label>
      <input id="untracked-note" maxlength="200" autocomplete="off" placeholder={t('untracked.notePlaceholder')} bind:value={note} />
    </div>

    <div class="actions">
      <button class="btn btn-primary btn-block" type="submit">{current ? t('common.save') : t('untracked.save')}</button>
      {#if current}
        <button class="btn btn-ghost" type="button" onclick={onremove}>{t('untracked.remove')}</button>
      {:else}
        <button class="btn btn-ghost" type="button" onclick={onclose}>{t('common.cancel')}</button>
      {/if}
    </div>
  </form>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    border: none;
    padding: 0;
    background: rgb(0 0 0 / 0.45);
    animation: fade-in 200ms ease-out;
    cursor: default;
  }
  .sheet {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 41;
    width: min(100%, 560px);
    max-height: calc(100% - var(--status-clear) - 16px);
    overflow-y: auto;
    padding: 10px 20px max(24px, env(safe-area-inset-bottom));
    border-radius: 24px 24px 0 0;
    background: var(--surface);
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.18);
    transform: translateX(-50%);
    animation: rise 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .sheet:focus {
    outline: none;
  }
  .grab {
    align-self: center;
    width: 40px;
    height: 5px;
    margin-bottom: -6px;
    border-radius: 3px;
    background: var(--surface-2);
  }
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-right: -10px;
  }
  .badge {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-soft);
    color: var(--accent-ink);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  h2 {
    font-size: 19px;
    font-weight: 700;
  }
  .optional {
    font-weight: 400;
    font-size: 14px;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 10px;
  }
  .sizes {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }
  .size {
    min-height: 84px;
    padding: 8px 4px;
    border: 1.5px solid var(--field);
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    text-align: center;
    cursor: pointer;
  }
  .size[aria-pressed='true'] {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes rise {
    from {
      transform: translate(-50%, 40px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .sheet {
      animation: none;
    }
  }
</style>
