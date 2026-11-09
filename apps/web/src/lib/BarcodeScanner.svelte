<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { isBarcode, startScanner } from './scanner';
  import { t } from './state.svelte';

  let { oncode, onclose }: { oncode: (code: string) => void; onclose: () => void } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  let stop: (() => void) | null = null;
  let failed = $state(false);
  let typed = $state('');

  onMount(async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || !video) throw new Error('camera');
      stop = await startScanner(video, (code) => {
        stop?.();
        stop = null;
        oncode(code);
      });
    } catch {
      failed = true;
    }
  });

  onDestroy(() => stop?.());

  function submitTyped(event: SubmitEvent) {
    event.preventDefault();
    const code = typed.replace(/\s/g, '');
    if (isBarcode(code)) oncode(code);
  }
</script>

<div class="scanner stack">
  {#if failed}
    <p class="notice">{t('foods.scanUnsupported')}</p>
  {:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} playsinline muted></video>
    <p class="help">{t('foods.scanHint')}</p>
  {/if}
  <form class="typed" onsubmit={submitTyped}>
    <label class="visually-hidden" for="typed-code">{t('foods.barcode')}</label>
    <input id="typed-code" class="input" inputmode="numeric" autocomplete="off" placeholder={t('foods.barcode')} bind:value={typed} />
    <button class="btn" type="submit" disabled={!isBarcode(typed.replace(/\s/g, ''))}>OK</button>
  </form>
  <button class="btn btn-ghost" type="button" onclick={onclose}>{t('foods.scanStop')}</button>
</div>

<style>
  video {
    width: 100%;
    max-height: 280px;
    object-fit: cover;
    border-radius: 16px;
    background: #000;
  }
  .typed {
    display: flex;
    gap: 8px;
  }
  .typed input {
    flex: 1;
    min-width: 0;
  }
</style>
