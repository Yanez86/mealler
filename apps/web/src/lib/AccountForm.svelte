<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Name / email / password / language / time zone form used by setup and registration. -->
<script lang="ts" module>
  import type { Locale } from '@mealler/shared';

  export interface AccountData {
    name: string;
    email: string;
    password: string;
    locale: Locale;
    timezone: string;
  }
</script>

<script lang="ts">
  import { LOCALES } from '@mealler/shared';
  import { app, t } from './state.svelte';

  let {
    submitLabel,
    fixedEmail = null,
    error = '',
    busy = false,
    onsubmit
  }: {
    submitLabel: string;
    fixedEmail?: string | null;
    error?: string;
    busy?: boolean;
    onsubmit: (data: AccountData) => void;
  } = $props();

  let name = $state('');
  let email = $state('');
  let password = $state('');
  let timezone = $state(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome');

  const timezones: string[] = (() => {
    try {
      return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
    } catch {
      return ['Europe/Rome', 'UTC'];
    }
  })();

  function submit(event: SubmitEvent) {
    event.preventDefault();
    onsubmit({ name, email: fixedEmail ?? email, password, locale: app.locale, timezone });
  }
</script>

<form class="card stack" onsubmit={submit}>
  <div class="field">
    <label for="name">{t('field.name')}</label>
    <input id="name" autocomplete="name" required maxlength="100" bind:value={name} />
  </div>
  <div class="field">
    <label for="email">{t('field.email')}</label>
    {#if fixedEmail}
      <input id="email" type="email" value={fixedEmail} readonly />
    {:else}
      <input id="email" type="email" autocomplete="email" required bind:value={email} />
    {/if}
  </div>
  <div class="field">
    <label for="password">{t('field.password')}</label>
    <input
      id="password"
      type="password"
      autocomplete="new-password"
      required
      minlength="10"
      aria-describedby="password-help"
      bind:value={password} />
    <p id="password-help" class="help">{t('field.passwordHint')}</p>
  </div>
  <div class="field">
    <label for="locale">{t('field.language')}</label>
    <select id="locale" bind:value={app.locale}>
      {#each LOCALES as code (code)}
        <option value={code}>{t(`locale.${code}`)}</option>
      {/each}
    </select>
  </div>
  <div class="field">
    <label for="timezone">{t('field.timezone')}</label>
    <select id="timezone" bind:value={timezone}>
      {#each timezones as tz (tz)}
        <option value={tz}>{tz}</option>
      {/each}
    </select>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <button class="btn btn-primary btn-block" type="submit" disabled={busy}>{submitLabel}</button>
</form>
