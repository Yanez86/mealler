<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LOCALES, UNIT_SYSTEMS, addDays, todayIn, type Locale, type Theme, type UnitSystem, type User } from '@mealler/shared';
  import { api, patch, post } from '$lib/api';
  import { app, errorMessage, setUser, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import { clearApiCache } from '$lib/offline.svelte';
  import { unsubscribe } from '$lib/push';

  const user = app.user as User;
  let name = $state(user.name);
  let locale = $state<Locale>(user.locale);
  let theme = $state<Theme>(user.theme);
  let units = $state<UnitSystem>(user.units ?? 'metric');
  let timezone = $state(user.timezone);
  let prefsMsg = $state('');
  let prefsError = $state('');

  const todayStr = todayIn(user.timezone);
  let exportFrom = $state(addDays(todayStr, -29));
  let exportTo = $state(todayStr);

  let current = $state('');
  let next = $state('');
  let pwMsg = $state('');
  let pwError = $state('');

  const timezones: string[] = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
    } catch {
      return [user.timezone];
    }
  })();

  async function savePrefs(event: SubmitEvent) {
    event.preventDefault();
    prefsMsg = prefsError = '';
    try {
      setUser(await patch<User>('/me', { name, locale, theme, timezone, units }));
      prefsMsg = t('common.saved');
    } catch (e) {
      prefsError = errorMessage(e);
    }
  }

  async function changePassword(event: SubmitEvent) {
    event.preventDefault();
    pwMsg = pwError = '';
    try {
      await post('/me/password', { current, next });
      current = next = '';
      pwMsg = t('profile.passwordChanged');
    } catch (e) {
      pwError = errorMessage(e);
    }
  }

  let deleteOpen = $state(false);
  let deletePassword = $state('');
  let deleteError = $state('');

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault();
    deleteError = '';
    if (!confirm(t('profile.deleteConfirm'))) return;
    try {
      await unsubscribe().catch(() => {});
      await api('DELETE', '/me', { password: deletePassword });
      await clearApiCache();
      setUser(null);
      await goto('/login', { replaceState: true });
    } catch (e) {
      deleteError = errorMessage(e);
    }
  }

  async function logout() {
    // This device should stop receiving this account's reminders.
    await unsubscribe().catch(() => {});
    await post('/auth/logout').catch(() => {});
    await clearApiCache();
    setUser(null);
    await goto('/login', { replaceState: true });
  }
</script>

<svelte:head><title>{t('profile.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('profile.title')} section="profile" subtitle={user.email} />

  <nav class="card links" aria-label={t('profile.diary')}>
    <a class="list-row" href="/profile/achievements"><span>{t('profile.achievements')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/slots"><span>{t('profile.slots')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/thresholds"><span>{t('profile.thresholds')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/notifications"><span>{t('profile.notifications')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/connector"><span>{t('profile.connector')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/news"><span>{t('profile.news')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/info"><span>{t('profile.info')}</span><Icon name="chevron" /></a>
    {#if user.role === 'admin'}
      <a class="list-row" href="/admin"><span>{t('profile.admin')}</span><Icon name="chevron" /></a>
    {/if}
  </nav>

  <form class="card stack" onsubmit={savePrefs}>
    <h2 class="section-title">{t('profile.preferences')}</h2>
    <div class="field">
      <label for="name">{t('field.name')}</label>
      <input id="name" required maxlength="100" bind:value={name} />
    </div>
    <div class="field">
      <label for="locale">{t('field.language')}</label>
      <select id="locale" bind:value={locale}>
        {#each LOCALES as code (code)}<option value={code}>{t(`locale.${code}`)}</option>{/each}
      </select>
    </div>
    <div class="field">
      <label for="theme">{t('field.theme')}</label>
      <select id="theme" bind:value={theme}>
        <option value="system">{t('theme.system')}</option>
        <option value="light">{t('theme.light')}</option>
        <option value="dark">{t('theme.dark')}</option>
      </select>
    </div>
    <div class="field">
      <label for="units">{t('field.units')}</label>
      <select id="units" aria-describedby="units-help" bind:value={units}>
        {#each UNIT_SYSTEMS as code (code)}<option value={code}>{t(`units.${code}`)}</option>{/each}
      </select>
      <p id="units-help" class="help">{t('units.help')}</p>
    </div>
    <div class="field">
      <label for="tz">{t('field.timezone')}</label>
      <select id="tz" bind:value={timezone}>
        {#each timezones as tz (tz)}<option value={tz}>{tz}</option>{/each}
      </select>
    </div>
    {#if prefsError}<p class="error" role="alert">{prefsError}</p>{/if}
    {#if prefsMsg}<p class="notice" role="status">{prefsMsg}</p>{/if}
    <button class="btn btn-primary" type="submit">{t('common.save')}</button>
  </form>

  <form class="card stack" onsubmit={changePassword}>
    <h2 class="section-title">{t('profile.password')}</h2>
    <input type="email" autocomplete="username" value={user.email} hidden />
    <div class="field">
      <label for="current">{t('profile.currentPassword')}</label>
      <input id="current" type="password" autocomplete="current-password" required bind:value={current} />
    </div>
    <div class="field">
      <label for="next">{t('profile.newPassword')}</label>
      <input id="next" type="password" autocomplete="new-password" minlength="10" required bind:value={next} />
      <p class="help">{t('field.passwordHint')}</p>
    </div>
    {#if pwError}<p class="error" role="alert">{pwError}</p>{/if}
    {#if pwMsg}<p class="notice" role="status">{pwMsg}</p>{/if}
    <button class="btn" type="submit">{t('profile.password')}</button>
  </form>

  <section class="card stack" aria-labelledby="export-title">
    <h2 id="export-title" class="section-title">{t('export.title')}</h2>
    <p class="help">{t('export.help')}</p>
    <div class="pair">
      <div class="field">
        <label for="ex-from">{t('export.from')}</label>
        <input id="ex-from" type="date" bind:value={exportFrom} />
      </div>
      <div class="field">
        <label for="ex-to">{t('export.to')}</label>
        <input id="ex-to" type="date" bind:value={exportTo} />
      </div>
    </div>
    <a class="btn" href="/api/export.csv?from={exportFrom}&to={exportTo}" download><Icon name="download" size={20} />{t('export.csv')}</a>
    <a class="btn btn-ghost" href="/api/export.json" download><Icon name="download" size={20} />{t('export.json')}</a>
  </section>

  <button class="btn btn-danger" type="button" onclick={logout}>{t('profile.logout')}</button>

  <section class="card stack" aria-labelledby="delete-title">
    <h2 id="delete-title" class="section-title">{t('profile.delete')}</h2>
    <p class="help">{t('profile.deleteHelp')}</p>
    {#if deleteOpen}
      <form class="stack" onsubmit={deleteAccount}>
        <div class="field">
          <label for="delete-pw">{t('profile.deletePassword')}</label>
          <input id="delete-pw" type="password" autocomplete="current-password" required bind:value={deletePassword} />
        </div>
        {#if deleteError}<p class="error" role="alert">{deleteError}</p>{/if}
        <button class="btn btn-danger" type="submit">{t('profile.deleteNow')}</button>
        <button class="btn btn-ghost" type="button" onclick={() => (deleteOpen = false)}>{t('common.cancel')}</button>
      </form>
    {:else}
      <button class="btn btn-ghost" type="button" onclick={() => (deleteOpen = true)}>{t('profile.delete')}</button>
    {/if}
  </section>

  <section class="about muted small" aria-label={t('profile.about')}>
    <p>{t('common.license')}</p>
    <p>
      {t('common.version', { v: app.status?.version ?? __APP_VERSION__ })} ·
      <a href={app.status?.sourceUrl ?? 'https://github.com/Yanez86/mealler'} rel="noopener" target="_blank">{t('common.source')}</a>
    </p>
  </section>
</main>

<style>
  .links {
    padding-top: 4px;
    padding-bottom: 4px;
  }
  .links a {
    justify-content: space-between;
    color: var(--text);
    text-decoration: none;
    font-weight: 500;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }
  .about {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
</style>
