<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Favorite } from '@mealler/shared';
  import { del, get } from '$lib/api';
  import { errorMessage, formatNumber, t } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let favorites = $state<Favorite[] | null>(null);
  let error = $state('');

  onMount(load);

  async function load() {
    try {
      favorites = await get<Favorite[]>('/favorites');
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function remove(f: Favorite) {
    try {
      await del(`/favorites/${f.id}`);
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }
</script>

<svelte:head><title>{t('fav.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('fav.title')} />
  <p class="muted">{t('fav.intro')}</p>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if favorites && !favorites.length}
    <p class="notice">{t('fav.none')}</p>
  {:else if favorites}
    <ul class="card list">
      {#each favorites as f (f.id)}
        <li class="list-row">
          <div class="grow">
            <p class="name">{f.name}</p>
            {#if f.name !== f.description}<p class="muted small">{f.description}</p>{/if}
            <p class="muted small">
              {#if f.kcal != null}{formatNumber(f.kcal)} kcal · {/if}{t('fav.uses', { n: f.uses })}
            </p>
          </div>
          <button class="btn btn-ghost" type="button" onclick={() => remove(f)}>{t('fav.remove')}</button>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .name {
    font-weight: 600;
  }
</style>
