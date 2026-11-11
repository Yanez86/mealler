<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- About Mealler: what it is, how it is built, where the nutritional values come from. -->
<script lang="ts">
  import { app, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import Logo from '$lib/Logo.svelte';
  import Splash from '$lib/Splash.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const version = app.status?.version ?? __APP_VERSION__;
  const source = app.status?.sourceUrl ?? 'https://github.com/Yanez86/mealler';
  const stack = ['svelte', 'server', 'db', 'pwa', 'misc'] as const;
  const sources = ['ai', 'connector', 'off', 'label', 'larn', 'category'] as const;

  // The start-up screen, shown on demand: a tap anywhere (or Escape) closes it again.
  let splash = $state(false);
</script>

<svelte:window onkeydown={(e) => splash && e.key === 'Escape' && (splash = false)} />

<svelte:head><title>{t('info.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('info.title')} section="profile">
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>

  <section class="card stack hero">
    <Logo size={72} title="Mealler" />
    <h2 class="name">Mealler</h2>
    <p class="muted">{t('common.version', { v: version })}</p>
    <button type="button" class="chip" aria-pressed={splash} onclick={() => (splash = true)}>Splash page</button>
    <p>{t('info.what')}</p>
  </section>

  <section class="card stack" aria-labelledby="info-stack">
    <h2 id="info-stack" class="section-title">{t('info.stackTitle')}</h2>
    <ul>
      {#each stack as k (k)}<li>{t(`info.stack.${k}`)}</li>{/each}
    </ul>
  </section>

  <section class="card stack" aria-labelledby="info-sources">
    <h2 id="info-sources" class="section-title">{t('info.sourcesTitle')}</h2>
    <ul>
      {#each sources as k (k)}<li>{t(`info.sources.${k}`)}</li>{/each}
    </ul>
    <p class="help">{t('info.estimates')}</p>
  </section>

  <section class="card stack" aria-labelledby="info-free">
    <h2 id="info-free" class="section-title">{t('info.freeTitle')}</h2>
    <p>{t('info.free')}</p>
    <p>{t('common.license')}</p>
    <a class="btn btn-ghost" href={source} rel="noopener" target="_blank">{t('common.source')}</a>
  </section>

  {#if splash}
    <div class="splash-preview">
      <Splash message={t('splash.starting')} {version} />
      <button type="button" class="close" aria-label={t('common.close')} onclick={() => (splash = false)}></button>
    </div>
  {/if}

  <footer class="maker">
    <span class="squid"><img src="/squid.svg" alt="" width="44" height="44" draggable="false" /></span>
    <p>Happy Squid inc</p>
  </footer>
</main>

<style>
  .hero {
    align-items: center;
    text-align: center;
  }
  .name {
    font-size: 24px;
    font-weight: 700;
  }
  /* Above the tab bar (z-index 20); the invisible button covers it all, so any tap closes it. */
  .splash-preview {
    position: fixed;
    inset: 0;
    z-index: 100;
  }
  .close {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
  }
  ul {
    margin: 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .maker {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 0 24px;
    font-size: 12px;
    letter-spacing: 0.04em;
    color: var(--text-2);
  }
  /* Same tinted tile as the food-category lattice on the start-up screen. */
  .squid {
    width: 64px;
    height: 64px;
    border-radius: 23%;
    background: color-mix(in srgb, #e8739a 22%, var(--surface));
    display: grid;
    place-items: center;
  }
  .squid img {
    display: block;
    user-select: none;
  }
</style>
