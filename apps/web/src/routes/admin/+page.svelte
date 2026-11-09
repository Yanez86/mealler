<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { isNewerVersion, type Invite, type User } from '@mealler/shared';
  import { del, get, patch, post } from '$lib/api';
  import { app, errorMessage, formatDate, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';
  import AiAdmin from '$lib/AiAdmin.svelte';

  let users = $state<User[]>([]);
  let invites = $state<Invite[]>([]);
  let registrationOpen = $state(false);
  let mcpEnabled = $state(false);
  let offEnabled = $state(true);
  let error = $state('');
  let copied = $state<string | null>(null);

  let inviteEmail = $state('');
  let inviteDays = $state(7);
  let newUser = $state({ name: '', email: '', password: '', role: 'user' as 'user' | 'admin' });

  onMount(async () => {
    if (app.user?.role !== 'admin') return goto('/profile', { replaceState: true });
    await load();
  });

  async function load() {
    try {
      [users, invites] = await Promise.all([get<User[]>('/admin/users'), get<Invite[]>('/admin/invites')]);
      const settings = await get<{ registrationOpen: boolean; mcpEnabled: boolean; offEnabled: boolean }>('/admin/settings');
      registrationOpen = settings.registrationOpen;
      mcpEnabled = settings.mcpEnabled;
      offEnabled = settings.offEnabled;
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function run(action: () => Promise<unknown>) {
    error = '';
    try {
      await action();
      await load();
    } catch (e) {
      error = errorMessage(e);
    }
  }

  const toggleActive = (u: User) => run(() => patch(`/admin/users/${u.id}`, { active: !u.active }));
  const setRole = (u: User, role: 'admin' | 'user') => run(() => patch(`/admin/users/${u.id}`, { role }));
  const revoke = (i: Invite) => run(() => del(`/admin/invites/${encodeURIComponent(i.token)}`));
  const setRegistration = () => run(() => patch('/admin/settings', { registrationOpen: !registrationOpen }));
  const setMcp = () => run(() => patch('/admin/settings', { mcpEnabled: !mcpEnabled }));
  const setOff = () => run(() => patch('/admin/settings', { offEnabled: !offEnabled }));
  const update = $derived(
    app.status && isNewerVersion(app.status.latestVersion, app.status.version) ? app.status.latestVersion : null
  );

  async function createInvite(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      const invite = await post<Invite>('/admin/invites', { email: inviteEmail || null, days: Number(inviteDays) });
      inviteEmail = '';
      await copy(invite);
    });
  }

  async function createUser(event: SubmitEvent) {
    event.preventDefault();
    await run(async () => {
      await post('/admin/users', { ...newUser, locale: app.locale, timezone: app.user?.timezone });
      newUser = { name: '', email: '', password: '', role: 'user' };
    });
  }

  async function copy(invite: Invite) {
    try {
      await navigator.clipboard.writeText(invite.url);
      copied = invite.token;
      setTimeout(() => (copied = null), 2500);
    } catch {
      prompt(t('admin.copy'), invite.url);
    }
  }
</script>

<svelte:head><title>{t('admin.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('admin.title')}>
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if update}
    <div class="notice" role="status">
      <p><strong>{t('update.available', { v: update })}</strong></p>
      <p class="small">{t('update.how')}</p>
    </div>
  {/if}

  <section class="card stack" aria-labelledby="mcp-title">
    <h2 id="mcp-title" class="section-title">{t('admin.mcp')}</h2>
    <label class="check">
      <input type="checkbox" checked={mcpEnabled} onchange={setMcp} />
      <span>{t('admin.mcp')}<br /><span class="muted small">{t('admin.mcpHelp')}</span></span>
    </label>
    <label class="check">
      <input type="checkbox" checked={offEnabled} onchange={setOff} />
      <span>{t('admin.off')}<br /><span class="muted small">{t('admin.offHelp')}</span></span>
    </label>
  </section>

  <AiAdmin />

  <section class="card" aria-labelledby="users-title">
    <h2 id="users-title" class="section-title">{t('admin.users')}</h2>
    <ul class="plain">
      {#each users as u (u.id)}
        <li class="list-row user">
          <div class="grow">
            <p><strong>{u.name}</strong> {#if u.id === app.user?.id}<span class="muted">({t('admin.you')})</span>{/if}</p>
            <p class="muted small">{u.active ? u.email : `${u.email} · ${t('admin.inactive')}`}</p>
          </div>
          <label class="visually-hidden" for="role-{u.id}">{t('admin.role')}</label>
          <select id="role-{u.id}" class="input role" value={u.role} onchange={(e) => setRole(u, e.currentTarget.value as 'admin' | 'user')}>
            <option value="user">{t('admin.role.user')}</option>
            <option value="admin">{t('admin.role.admin')}</option>
          </select>
          {#if u.id !== app.user?.id}
            <button class="btn btn-ghost" type="button" onclick={() => toggleActive(u)}>
              {u.active ? t('admin.deactivate') : t('admin.activate')}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  </section>

  <section class="card stack" aria-labelledby="invites-title">
    <h2 id="invites-title" class="section-title">{t('admin.invites')}</h2>
    {#if invites.length}
      <ul class="plain">
        {#each invites as i (i.token)}
          <li class="list-row">
            <div class="grow">
              <p>{i.email ?? '—'}</p>
              <p class="muted small">{t('admin.expires', { d: formatDate(i.expiresAt.slice(0, 10), { day: 'numeric', month: 'long' }) })}</p>
            </div>
            <button class="btn btn-ghost" type="button" onclick={() => copy(i)}>{copied === i.token ? t('admin.copied') : t('admin.copy')}</button>
            <button class="btn btn-ghost" type="button" onclick={() => revoke(i)}>{t('admin.revoke')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="muted">{t('admin.noInvites')}</p>
    {/if}
    <form class="stack" onsubmit={createInvite}>
      <div class="field">
        <label for="invite-email">{t('admin.inviteEmail')} <span class="muted small">({t('common.optional')})</span></label>
        <input id="invite-email" type="email" bind:value={inviteEmail} />
      </div>
      <div class="field">
        <label for="invite-days">{t('admin.inviteDays')}</label>
        <input id="invite-days" type="number" min="1" max="60" bind:value={inviteDays} />
      </div>
      <button class="btn btn-primary" type="submit">{t('admin.newInvite')}</button>
    </form>
    <label class="check">
      <input type="checkbox" checked={registrationOpen} onchange={setRegistration} />
      <span>{t('admin.registration')}<br /><span class="muted small">{t('admin.registrationHelp')}</span></span>
    </label>
  </section>

  <form class="card stack" onsubmit={createUser}>
    <h2 class="section-title">{t('admin.newUser')}</h2>
    <div class="field">
      <label for="nu-name">{t('field.name')}</label>
      <input id="nu-name" required maxlength="100" bind:value={newUser.name} />
    </div>
    <div class="field">
      <label for="nu-email">{t('field.email')}</label>
      <input id="nu-email" type="email" required bind:value={newUser.email} />
    </div>
    <div class="field">
      <label for="nu-password">{t('field.password')}</label>
      <input id="nu-password" type="password" autocomplete="new-password" minlength="10" required bind:value={newUser.password} />
      <p class="help">{t('field.passwordHint')}</p>
    </div>
    <div class="field">
      <label for="nu-role">{t('admin.role')}</label>
      <select id="nu-role" bind:value={newUser.role}>
        <option value="user">{t('admin.role.user')}</option>
        <option value="admin">{t('admin.role.admin')}</option>
      </select>
    </div>
    <button class="btn btn-primary" type="submit"><Icon name="plus" size={20} />{t('admin.newUser')}</button>
  </form>
</main>

<style>
  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grow {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .user {
    flex-wrap: wrap;
  }
  .role {
    width: auto;
    min-width: 0;
  }
  .check {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-height: 44px;
  }
  .check input {
    width: 22px;
    height: 22px;
    margin-top: 2px;
    flex: none;
    accent-color: var(--accent);
  }
</style>
