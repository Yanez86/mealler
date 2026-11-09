<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { User } from '@mealler/shared';
  import { post } from '$lib/api';
  import { app, errorMessage, setUser, t } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    busy = true;
    error = '';
    try {
      setUser(await post<User>('/auth/login', { email, password }));
      await goto('/', { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('login.title')} · Mealler</title></svelte:head>

<main class="page">
  <TopBar title={t('login.title')} />
  <form class="card stack" onsubmit={submit}>
    <div class="field">
      <label for="email">{t('field.email')}</label>
      <input id="email" type="email" autocomplete="username" required bind:value={email} />
    </div>
    <div class="field">
      <label for="password">{t('field.password')}</label>
      <input id="password" type="password" autocomplete="current-password" required bind:value={password} />
    </div>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn btn-primary btn-block" type="submit" disabled={busy}>{t('login.submit')}</button>
  </form>
  <p class="muted small" style="margin-top: 16px">
    {#if app.status?.registrationOpen}
      <a href="/register">{t('login.register')}</a>
    {:else}
      {t('login.noAccount')}
    {/if}
  </p>
</main>
