<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Start-up screen: logo, name, version and what the app is doing. -->
<script lang="ts">
  import Logo from './Logo.svelte';

  let { message, version }: { message: string; version: string } = $props();
</script>

<div class="splash" role="status" aria-live="polite">
  <div class="mark"><Logo size={112} title="Mealler" /></div>
  <p class="name">Mealler</p>
  <p class="version">v{version}</p>
  <p class="message">{message}</p>
</div>

<style>
  .splash {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 24px;
    background: var(--bg);
    text-align: center;
  }
  .mark {
    width: 152px;
    height: 152px;
    border-radius: 36px;
    background: var(--surface);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    animation: pop 600ms ease-out both;
  }
  .name {
    font-size: 32px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .version {
    font-size: 15px;
    color: var(--text-2);
    font-variant-numeric: tabular-nums;
  }
  .message {
    margin-top: 20px;
    min-height: 22px;
    font-size: 15px;
    color: var(--text-2);
  }
  @keyframes pop {
    from {
      transform: scale(0.85);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }
</style>
