<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- A meal off the diary: eaten, but not logged (or not all of it). Opens from the meal's "Off the
     diary" button or its pill; how much (roughly) and a note are both optional. The meal then counts as
     filled, and the day's totals stay partial and out of the averages. -->
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

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsave({ size, note: note.trim() || null });
  }

  onMount(() => dialog?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<button class="backdrop" type="button" tabindex="-1" aria-label={t('common.close')} onclick={onclose}></button>
<div class="wrap">
  <div
    bind:this={dialog}
    class="card popup"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="untracked-title"
    aria-describedby="untracked-help">
    <form class="stack" onsubmit={submit}>
      <div class="head">
        <span class="badge" aria-hidden="true"><Icon name="unseen" size={22} /></span>
        <h2 id="untracked-title" class="grow">{t('untracked.title', { slot })}</h2>
        <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={onclose}>
          <Icon name="close" />
        </button>
      </div>
      <p id="untracked-help" class="help">{t('untracked.help')}</p>

      <fieldset>
        <legend class="label">{t('untracked.size')} <span class="muted small">({t('common.optional')})</span></legend>
        <div class="sizes">
          {#each UNTRACKED_SIZES as s (s)}
            <button class="chip" type="button" aria-pressed={size === s} onclick={() => (size = size === s ? null : s)}>
              {#if size === s}<Icon name="check" size={18} stroke={2.5} />{/if}{t(`untracked.size.${s}`)}
            </button>
          {/each}
        </div>
      </fieldset>

      <div class="field">
        <label for="untracked-note">{t('untracked.note')} <span class="muted small">({t('common.optional')})</span></label>
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
  .wrap {
    position: fixed;
    inset: 0;
    z-index: 41;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(16px, var(--status-clear)) 16px max(16px, env(safe-area-inset-bottom));
    pointer-events: none;
  }
  .popup {
    pointer-events: auto;
    width: 100%;
    max-width: 420px;
    max-height: 100%;
    overflow-y: auto;
    padding: 12px 16px 16px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
    animation: pop-in 240ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .popup:focus {
    outline: none;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-right: -8px;
  }
  .badge {
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-2);
    color: var(--text-2);
  }
  h2 {
    font-size: 18px;
    font-weight: 700;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: none;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: 8px;
  }
  /* All four sizes in view: they wrap instead of scrolling sideways. */
  .sizes {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
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
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .popup {
      animation: none;
    }
  }
</style>
