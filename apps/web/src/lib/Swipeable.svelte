<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Swipe left to reveal a delete button behind the content. Keyboard and screen reader users reach
     the same button with Tab: focusing it slides the content open. -->
<script lang="ts" module>
  // Only one row stays open at a time.
  let closeOpen: (() => void) | null = null;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    label,
    ondelete,
    disabled = false,
    radius = '0px',
    clip = radius,
    background = 'transparent',
    children
  }: {
    label: string;
    ondelete: () => void;
    disabled?: boolean;
    /** Corners of the delete button. */
    radius?: string;
    /** Corners of the swiping area, when they differ from the button's (rows inside a card: none). */
    clip?: string;
    background?: string;
    children: Snippet;
  } = $props();

  const ACTION = 80;
  let offset = $state(0);
  let dragging = $state(false);
  let mode: 'idle' | 'maybe' | 'x' | 'y' = 'idle';
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let suppressClick = false;

  function close() {
    offset = 0;
    if (closeOpen === close) closeOpen = null;
  }

  function open() {
    if (closeOpen && closeOpen !== close) closeOpen();
    closeOpen = close;
    offset = -ACTION;
  }

  function swallowNextClick() {
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 400);
  }

  function down(e: PointerEvent) {
    if (disabled || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // A row inside a swipeable card swipes on its own.
    e.stopPropagation();
    mode = 'maybe';
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startOffset = offset;
  }

  function move(e: PointerEvent) {
    if (e.pointerId !== pointerId || (mode !== 'maybe' && mode !== 'x')) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (mode === 'maybe') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        mode = 'x';
        dragging = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else {
        if (Math.abs(dy) > 8) mode = 'y';
        return;
      }
    }
    let x = Math.min(0, startOffset + dx);
    // Past the button the content follows the finger more slowly.
    if (x < -ACTION) x = -ACTION + (x + ACTION) / 3;
    offset = x;
    e.preventDefault();
  }

  function up(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (mode === 'x') {
      swallowNextClick();
      if (offset < -ACTION / 2) open();
      else close();
    } else if (mode === 'maybe' && offset !== 0) {
      // A tap on an open row closes it instead of opening the link inside.
      swallowNextClick();
      close();
    }
    mode = 'idle';
    dragging = false;
    pointerId = -1;
  }

  function click(e: MouseEvent) {
    if (!suppressClick) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClick = false;
  }

  function remove() {
    close();
    ondelete();
  }
</script>

<div class="swipe" class:active={offset !== 0} style:--swipe-radius={radius} style:--swipe-clip={clip}>
  <!-- The swipe is a touch shortcut: the delete button below is the keyboard and screen reader way. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="content"
    class:dragging
    style:background
    style:transform={offset ? `translateX(${offset}px)` : undefined}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    ondragstart={(e) => e.preventDefault()}
    onclickcapture={click}>
    {@render children()}
  </div>
  {#if !disabled}
    <button class="action" type="button" aria-label={label} onclick={remove} onfocus={open} onblur={close}>
      <Icon name="trash" />
    </button>
  {/if}
</div>

<style>
  .swipe {
    position: relative;
    overflow: hidden;
    border-radius: var(--swipe-clip);
  }
  .content {
    position: relative;
    z-index: 1;
    touch-action: pan-y;
    transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .content.dragging {
    transition: none;
  }
  .action {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 80px;
    border: none;
    border-radius: var(--swipe-radius);
    background: var(--danger);
    color: var(--on-danger);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
  }
  .swipe.active .action,
  .action:focus-visible {
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .content {
      transition: none;
    }
  }
</style>
