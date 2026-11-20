<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Swipe left to reveal a red trash icon beside the content, or a few named actions (`actions`).
     Keyboard and screen reader users reach the same buttons with Tab: focusing one slides the content
     open. -->
<script lang="ts" module>
  import type { ComponentProps } from 'svelte';
  import type IconComponent from './Icon.svelte';

  /** A named button revealed by the swipe, instead of the trash. */
  export interface SwipeAction {
    /** Spoken name, e.g. "Mark Dinner as skipped". */
    label: string;
    /** Short visible text under the icon. */
    text: string;
    icon: ComponentProps<typeof IconComponent>['name'];
    tone: 'neutral' | 'accent' | 'danger';
    run: () => void;
  }

  // Only one row stays open at a time.
  let closeOpen: (() => void) | null = null;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  let {
    label = '',
    ondelete = () => {},
    actions,
    disabled = false,
    radius = '0px',
    background = 'transparent',
    children
  }: {
    label?: string;
    ondelete?: () => void;
    /** Named actions in place of the trash, left to right. */
    actions?: SwipeAction[];
    disabled?: boolean;
    /** Corners of the swiping area, as the card inside it. */
    radius?: string;
    background?: string;
    children: Snippet;
  } = $props();

  // How far the content slides: the trash icon (or each named action) sits in this space.
  const ACTION = $derived(actions?.length ? actions.length * 96 : 72);
  let row = $state<HTMLDivElement | null>(null);
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

  function act(action: SwipeAction) {
    close();
    action.run();
  }

  // Moving between the named actions with Tab keeps the row open.
  function focusOut(e: FocusEvent) {
    if (!row?.contains(e.relatedTarget as Node | null)) close();
  }
</script>

<div class="swipe" style:--swipe-radius={radius} bind:this={row}>
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
  {#if !disabled && actions?.length}
    <div
      class="actions tone-{actions[0].tone}"
      style:width="{ACTION + 24}px"
      style:opacity={Math.min(1, (-offset / ACTION) * 1.5)}
      onfocusin={open}
      onfocusout={focusOut}>
      {#each actions as action (action.text)}
        <button class="named tone-{action.tone}" type="button" aria-label={action.label} onclick={() => act(action)}>
          <Icon name={action.icon} size={22} stroke={2.2} />
          <span>{action.text}</span>
        </button>
      {/each}
    </div>
  {:else if !disabled}
    <button
      class="action"
      type="button"
      aria-label={label}
      style:opacity={Math.min(1, -offset / ACTION)}
      onclick={remove}
      onfocus={open}
      onblur={close}>
      <Icon name="trash" size={26} stroke={2.2} />
    </button>
  {/if}
</div>

<style>
  /* isolation keeps the layers below inside the row, so the tab bar always stays on top. */
  .swipe {
    position: relative;
    overflow: hidden;
    isolation: isolate;
    border-radius: var(--swipe-radius);
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
    width: 72px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--danger);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .action:focus-visible {
    outline-offset: -6px;
    border-radius: 16px;
  }
  /* Named actions: filled buttons side by side; the strip reaches under the card's rounded corner. */
  .actions {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    padding-left: 24px;
  }
  .named {
    flex: 1;
    min-width: 0;
    padding: 0 6px;
    border: none;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    line-height: 1.2;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
  }
  .named:focus-visible {
    outline: 3px solid var(--surface);
    outline-offset: -6px;
    border-radius: 14px;
  }
  .tone-neutral {
    background: var(--text-2);
    color: var(--surface);
  }
  .tone-accent {
    background: var(--accent-ink);
    color: var(--surface);
  }
  .tone-danger {
    background: var(--danger);
    color: var(--on-danger);
  }
  @media (prefers-reduced-motion: reduce) {
    .content {
      transition: none;
    }
  }
</style>
