<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { User } from '@mealler/shared';
  import { get, post } from '$lib/api';
  import AccountForm, { type AccountData } from '$lib/AccountForm.svelte';
  import { app, errorMessage, setUser, t } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const token = page.url.searchParams.get('token');
  let phase = $state<'loading' | 'ok' | 'invalid' | 'closed'>('loading');
  let fixedEmail = $state<string | null>(null);
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    if (token) {
      try {
        const invite = await get<{ valid: boolean; email: string | null }>(`/invites/${encodeURIComponent(token)}`);
        phase = invite.valid ? 'ok' : 'invalid';
        fixedEmail = invite.email;
      } catch {
        phase = 'invalid';
      }
    } else {
      phase = app.status?.registrationOpen ? 'ok' : 'closed';
    }
  });

  async function register(data: AccountData) {
    busy = true;
    error = '';
    try {
      setUser(await post<User>('/register', { ...data, token: token ?? undefined }));
      await goto('/', { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('register.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('register.title')} />
  {#if phase === 'loading'}
    <p class="muted" role="status">{t('common.loading')}</p>
  {:else if phase === 'invalid'}
    <p class="notice" role="alert">{t('register.invalidInvite')}</p>
  {:else if phase === 'closed'}
    <p class="notice" role="alert">{t('register.closed')}</p>
  {:else}
    <AccountForm submitLabel={t('register.submit')} {fixedEmail} {error} {busy} onsubmit={register} />
  {/if}
  <a href="/login">{t('login.title')}</a>
</main>
