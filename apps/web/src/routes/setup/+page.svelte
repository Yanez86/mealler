<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import type { User } from '@mealler/shared';
  import { post } from '$lib/api';
  import AccountForm, { type AccountData } from '$lib/AccountForm.svelte';
  import { app, errorMessage, setUser, t } from '$lib/state.svelte';
  import TopBar from '$lib/TopBar.svelte';

  let error = $state('');
  let busy = $state(false);

  async function create(data: AccountData) {
    busy = true;
    error = '';
    try {
      setUser(await post<User>('/setup', data));
      if (app.status) app.status.setupRequired = false;
      await goto('/', { replaceState: true });
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>{t('setup.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('setup.title')} />
  <p class="muted">{t('setup.intro')}</p>
  <AccountForm submitLabel={t('setup.submit')} {error} {busy} onsubmit={create} />
</main>
