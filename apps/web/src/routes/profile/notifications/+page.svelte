<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { addDays, todayIn, type User } from '@mealler/shared';
  import { patch, post } from '$lib/api';
  import { currentSubscription, pushSupport, subscribe, unsubscribe, type PushSupport } from '$lib/push';
  import { app, errorMessage, formatDate, setUser, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  const user = $derived(app.user as User);
  let support = $state<PushSupport>('ok');
  let permission = $state<NotificationPermission>('default');
  let subscribed = $state(false);
  let busy = $state(false);
  let message = $state('');
  let error = $state('');
  let quietStart = $state(app.user?.quietStart ?? '');
  let quietEnd = $state(app.user?.quietEnd ?? '');

  onMount(async () => {
    support = pushSupport();
    if (support !== 'ok') return;
    permission = Notification.permission;
    subscribed = !!(await currentSubscription().catch(() => null));
  });

  async function run(action: () => Promise<void>) {
    busy = true;
    message = error = '';
    try {
      await action();
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  const enable = () =>
    run(async () => {
      permission = await subscribe();
      subscribed = permission === 'granted';
    });

  const disable = () =>
    run(async () => {
      await unsubscribe();
      subscribed = false;
    });

  const test = () =>
    run(async () => {
      await post('/push/test');
      message = t('notif.testSent');
    });

  const update = (body: Partial<User>) =>
    run(async () => {
      setUser(await patch<User>('/me', body));
      message = t('common.saved');
    });

  const today = $derived(todayIn(user.timezone));
  const paused = $derived(!!user.remindersPausedUntil && user.remindersPausedUntil >= today);

  function saveQuiet(event: SubmitEvent) {
    event.preventDefault();
    const both = quietStart && quietEnd;
    void update({ quietStart: both ? quietStart : null, quietEnd: both ? quietEnd : null });
  }
</script>

<svelte:head><title>{t('notif.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('notif.title')} section="profile">
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>
  <p class="muted">{t('notif.intro')}</p>

  <section class="card stack" aria-labelledby="device-title">
    <h2 id="device-title" class="section-title">{t('notif.device')}</h2>
    {#if support === 'insecure'}
      <p class="notice">{t('notif.insecure')}</p>
    {:else if support === 'ios-not-installed'}
      <p class="notice">{t('notif.ios')}</p>
    {:else if support === 'unsupported'}
      <p class="notice">{t('notif.unsupported')}</p>
    {:else if permission === 'denied'}
      <p class="notice">{t('notif.denied')}</p>
    {:else if subscribed}
      <p class="ok"><Icon name="check" size={18} stroke={2.5} />{t('notif.enabled')}</p>
      <button class="btn btn-primary" type="button" disabled={busy} onclick={test}>{t('notif.test')}</button>
      <button class="btn btn-ghost" type="button" disabled={busy} onclick={disable}>{t('notif.disable')}</button>
    {:else}
      <button class="btn btn-primary btn-block" type="button" disabled={busy} onclick={enable}>{t('notif.enable')}</button>
    {/if}
  </section>

  <section class="card stack" aria-labelledby="rem-title">
    <h2 id="rem-title" class="section-title">{t('notif.reminders')}</h2>
    <label class="check">
      <input
        type="checkbox"
        checked={user.remindersEnabled}
        disabled={busy}
        onchange={(e) => update({ remindersEnabled: e.currentTarget.checked })} />
      <span>{t('notif.reminders')}<br /><span class="muted small">{t('notif.remindersHelp')}</span></span>
    </label>
  </section>

  <form class="card stack" onsubmit={saveQuiet}>
    <h2 class="section-title">{t('notif.quiet')}</h2>
    <p class="help">{t('notif.quietHelp')}</p>
    <div class="pair">
      <div class="field">
        <label for="q-start">{t('notif.quietFrom')}</label>
        <input id="q-start" type="time" bind:value={quietStart} />
      </div>
      <div class="field">
        <label for="q-end">{t('notif.quietTo')}</label>
        <input id="q-end" type="time" bind:value={quietEnd} />
      </div>
    </div>
    <button class="btn" type="submit" disabled={busy}>{t('common.save')}</button>
  </form>

  <section class="card stack" aria-labelledby="pause-title">
    <h2 id="pause-title" class="section-title">{t('notif.pause')}</h2>
    {#if paused}
      <p>{t('notif.pausedUntil', { d: formatDate(user.remindersPausedUntil as string, { day: 'numeric', month: 'long' }) })}</p>
      <button class="btn" type="button" disabled={busy} onclick={() => update({ remindersPausedUntil: null })}>{t('notif.resume')}</button>
    {:else}
      <button class="btn" type="button" disabled={busy} onclick={() => update({ remindersPausedUntil: addDays(today, 6) })}>{t('notif.pauseWeek')}</button>
    {/if}
  </section>

  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if message}<p class="notice" role="status">{message}</p>{/if}
</main>

<style>
  .ok {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ok-ink);
    font-weight: 600;
  }
  .pair {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
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
