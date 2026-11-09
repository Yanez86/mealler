<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LOCALES, type Locale, type Theme, type User } from '@mealler/shared';
  import { patch, post } from '$lib/api';
  import { app, errorMessage, setUser, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const user = app.user as User;
  let name = $state(user.name);
  let locale = $state<Locale>(user.locale);
  let theme = $state<Theme>(user.theme);
  let timezone = $state(user.timezone);
  let prefsMsg = $state('');
  let prefsError = $state('');

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
      setUser(await patch<User>('/me', { name, locale, theme, timezone }));
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

  async function logout() {
    await post('/auth/logout').catch(() => {});
    setUser(null);
    await goto('/login', { replaceState: true });
  }
</script>

<svelte:head><title>{t('profile.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('profile.title')} subtitle={user.email} />

  <nav class="card links" aria-label={t('profile.diary')}>
    <a class="list-row" href="/profile/slots"><span>{t('profile.slots')}</span><Icon name="chevron" /></a>
    <a class="list-row" href="/profile/thresholds"><span>{t('profile.thresholds')}</span><Icon name="chevron" /></a>
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

  <button class="btn btn-danger" type="button" onclick={logout}>{t('profile.logout')}</button>

  <section class="about muted small" aria-label={t('profile.about')}>
    <p>{t('common.license')}</p>
    <p>
      {t('common.version', { v: app.status?.version ?? '' })} ·
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
  .about {
    display: flex;
    flex-direction: column;
    gap: 4px;
    text-align: center;
  }
</style>
