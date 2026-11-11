<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Landing page of a password reset link (made by an administrator or printed by the server's command line). -->
<script lang="ts">
  import { page } from '$app/state';
  import { post } from '$lib/api';
  import { errorMessage, t } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const token = page.url.searchParams.get('token') ?? '';
  let password = $state('');
  let error = $state('');
  let busy = $state(false);
  let done = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      await post('/auth/reset', { token, password });
      done = true;
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('reset.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('reset.title')} />
  {#if done}
    <p class="notice" role="status">{t('reset.done')}</p>
  {:else}
    <form class="card stack" onsubmit={submit}>
      <div class="field">
        <label for="password">{t('profile.newPassword')}</label>
        <input id="password" type="password" autocomplete="new-password" minlength="10" required bind:value={password} />
        <p class="help">{t('field.passwordHint')}</p>
      </div>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn btn-primary btn-block" type="submit" disabled={busy || !token}>{t('reset.submit')}</button>
    </form>
  {/if}
  <a href="/login">{t('login.title')}</a>
</main>
