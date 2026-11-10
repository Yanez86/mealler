<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "Achievement unlocked": shown once per device for achievements unlocked today, checked on each page change. -->
<script lang="ts">
  import { todayIn, type AchievementState } from '@mealler/shared';
  import { get } from './api';
  import { app, t } from './state.svelte';
  import AchievementIcon from './AchievementIcon.svelte';

  let { path }: { path: string } = $props();
  let shown = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const key = () => `mealler-achievements-seen-${app.user?.id}`;
  function seen(): string[] {
    try {
      return JSON.parse(localStorage.getItem(key()) ?? '[]');
    } catch {
      return [];
    }
  }

  async function check() {
    if (!app.user || shown) return;
    const today = todayIn(app.user.timezone);
    const list = await get<AchievementState[]>('/achievements').catch(() => []);
    const done = seen();
    const fresh = list.filter((a) => a.at === today && !done.includes(a.id));
    if (!fresh.length) return;
    try {
      localStorage.setItem(key(), JSON.stringify([...done, ...fresh.map((a) => a.id)].slice(-100)));
    } catch {
      // Without storage the toast may show again on the next page; nothing is lost.
    }
    shown = fresh[0].id;
    clearTimeout(timer);
    timer = setTimeout(() => (shown = null), 6000);
  }

  $effect(() => {
    void path;
    void check();
  });

  // Swipe left to dismiss: the toast follows the finger and goes away past a third of its width.
  let dx = $state(0);
  let dragging = $state(false);
  let startX: number | null = null;
  let moved = false;

  function down(e: PointerEvent) {
    if (!e.isPrimary) return;
    startX = e.clientX;
    moved = false;
  }
  function move(e: PointerEvent) {
    if (startX === null) return;
    const d = Math.min(0, e.clientX - startX);
    if (!dragging && d > -8) return;
    if (!dragging) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging = moved = true;
    dx = d;
  }
  function up(e: PointerEvent) {
    if (startX === null) return;
    startX = null;
    dragging = false;
    if (dx < -(e.currentTarget as HTMLElement).offsetWidth / 3) {
      dx = -window.innerWidth;
      clearTimeout(timer);
      timer = setTimeout(() => ((shown = null), (dx = 0)), 200);
    } else dx = 0;
  }
  function click(e: MouseEvent) {
    // A swipe is not a tap: it does not open the achievements page.
    if (moved) e.preventDefault();
    else shown = null;
  }
</script>

<div role="status">
{#if shown}
  <a
    class="toast"
    class:dragging
    href="/profile/achievements"
    style:translate="{dx}px 0"
    style:opacity={1 + dx / 400}
    draggable="false"
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onclick={click}>
    <span class="pop"><AchievementIcon id={shown} size={56} /></span>
    <span>
      <small>{t('ach.toast')}</small>
      <b>{t(`ach.${shown}` as never)}</b>
      <span class="muted">{t(`ach.${shown}.how` as never)}</span>
    </span>
  </a>
{/if}
</div>

<style>
  .toast {
    position: fixed;
    z-index: 50;
    top: calc(env(safe-area-inset-top, 0px) + 12px);
    left: 50%;
    transform: translateX(-50%);
    width: min(420px, calc(100% - 32px));
    box-sizing: border-box;
    display: flex;
    gap: 14px;
    align-items: center;
    padding: 12px 16px 12px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    text-decoration: none;
    box-shadow: 0 14px 32px -16px rgba(20, 24, 29, 0.35);
    animation: drop 0.35s ease-out both;
    touch-action: pan-y;
    transition:
      translate 200ms ease-out,
      opacity 200ms ease-out;
  }
  .toast.dragging {
    transition: none;
  }
  small {
    display: block;
    color: var(--accent-ink);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  b {
    display: block;
  }
  .muted {
    font-size: 13px;
  }
  .pop {
    display: inline-flex;
    animation: pop 0.7s cubic-bezier(0.3, 1.6, 0.5, 1) 0.15s both;
  }
  @keyframes drop {
    from {
      opacity: 0;
      transform: translate(-50%, -16px);
    }
  }
  @keyframes pop {
    from {
      transform: scale(0.6) rotate(-12deg);
    }
  }
</style>
