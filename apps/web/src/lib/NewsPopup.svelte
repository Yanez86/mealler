<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- What's new after an update, in a popup. The X, Escape or a swipe to the left slide it away to the left. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { formatDate, t } from './state.svelte';
  import type { Release } from './changelog';
  import Icon from './Icon.svelte';

  let { version, releases, onclose }: { version: string; releases: Release[]; onclose: () => void } = $props();

  let offset = $state(0);
  let dragging = $state(false);
  let leaving = $state(false);
  let dialog = $state<HTMLDivElement | null>(null);
  let startX = 0;
  let startY = 0;
  let pointerId = -1;
  let mode: 'idle' | 'maybe' | 'x' = 'idle';

  // The backdrop fades as the card moves away.
  const fade = $derived(leaving ? 0 : Math.max(0.2, 1 + offset / 400));

  // Focus goes to the popup itself: screen readers read it, and no focus ring lands on the X.
  onMount(() => {
    dialog?.focus();
  });

  function close() {
    if (leaving) return;
    leaving = true;
    dragging = false;
    offset = -(window.innerWidth + 40);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(onclose, reduced ? 0 : 280);
  }

  function down(e: PointerEvent) {
    if (leaving || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    mode = 'maybe';
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== pointerId || mode === 'idle') return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (mode === 'maybe') {
      // Vertical moves scroll the list; only a horizontal swipe moves the card.
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        mode = 'x';
        dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        if (Math.abs(dy) > 8) mode = 'idle';
        return;
      }
    }
    // To the right it barely moves: the card leaves only to the left.
    offset = dx < 0 ? dx : dx / 6;
    e.preventDefault();
  }

  function up(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (mode === 'x') {
      dragging = false;
      if (offset < -80) close();
      else offset = 0;
    }
    mode = 'idle';
    pointerId = -1;
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && close()} />

<div class="backdrop" style:opacity={fade}></div>
<div class="wrap">
  <div
    bind:this={dialog}
    class="card popup"
    class:dragging
    class:leaving
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-labelledby="news-popup-title"
    style:transform={offset ? `translateX(${offset}px)` : undefined}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}>
    <header>
      <span class="gift"><Icon name="gift" /></span>
      <div class="grow">
        <h2 id="news-popup-title">{t('news.title')}</h2>
        <p class="muted small">{t('news.banner', { v: version })}</p>
      </div>
      <button class="icon-btn plain" type="button" aria-label={t('common.close')} onclick={close}>
        <Icon name="close" />
      </button>
    </header>

    <div class="body">
      {#each releases as release (release.version)}
        <section>
          <h3>
            {t('common.version', { v: release.version })}
            {#if release.date}<span class="muted small">{formatDate(release.date, { day: 'numeric', month: 'long' })}</span>{/if}
          </h3>
          {#each release.groups as group (group.title)}
            <p class="label">{group.title}</p>
            <ul>
              {#each group.items as item, i (i)}<li>{item}</li>{/each}
            </ul>
          {/each}
        </section>
      {/each}
    </div>

    <a class="btn btn-ghost all" href="/news">{t('news.all')}</a>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: rgb(0 0 0 / 0.45);
    transition: opacity 280ms ease;
    animation: fade-in 200ms ease-out;
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
    max-width: 480px;
    max-height: min(640px, 100%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 12px 8px 20px;
    box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
    touch-action: pan-y;
    transition:
      transform 280ms cubic-bezier(0.4, 0, 0.6, 1),
      opacity 280ms ease;
    animation: pop-in 260ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .popup:focus {
    outline: none;
  }
  .popup.dragging {
    transition: none;
  }
  .popup.leaving {
    opacity: 0;
  }
  header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .gift {
    flex: none;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: flex;
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
    font-size: 20px;
    font-weight: 700;
  }
  .body {
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  h3 {
    font-size: 16px;
    font-weight: 700;
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }
  .label {
    margin-top: 8px;
  }
  ul {
    margin: 4px 0 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    line-height: 1.45;
  }
  .all {
    align-self: center;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
  @keyframes pop-in {
    from {
      opacity: 0;
      transform: translateY(16px) scale(0.97);
    }
  }
</style>
