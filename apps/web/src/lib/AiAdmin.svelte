<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Administration of in-app estimates: API key, models, spending cap, photos, monthly usage. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { AiSettings } from '@mealler/shared';
  import { get, patch, post } from './api';
  import { app, errorMessage, t } from './state.svelte';

  interface UsageRow {
    userId: number;
    name: string;
    model: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  }

  let settings = $state<AiSettings | null>(null);
  let apiKey = $state('');
  let cap = $state('');
  let limits = $state({ dailyRequests: '', dailyTokens: '', perMinute: '', instanceMonthlyUsd: '' });
  let usage = $state<UsageRow[]>([]);
  let total = $state(0);
  let message = $state('');
  let error = $state('');
  let busy = $state(false);

  const usd = (v: number) =>
    new Intl.NumberFormat(app.locale, { style: 'currency', currency: 'USD', maximumFractionDigits: v < 1 ? 4 : 2 }).format(v);

  onMount(load);

  async function load() {
    try {
      settings = await get<AiSettings>('/admin/ai');
      cap = settings.monthlyCapUsd == null ? '' : String(settings.monthlyCapUsd);
      const text = (v: number | null) => (v == null ? '' : String(v));
      limits = {
        dailyRequests: text(settings.dailyRequests),
        dailyTokens: text(settings.dailyTokens),
        perMinute: text(settings.perMinute),
        instanceMonthlyUsd: text(settings.instanceMonthlyUsd)
      };
      // The total is the instance's own count: it includes accounts deleted during the month.
      ({ rows: usage, totalUsd: total } = await get<{ rows: UsageRow[]; totalUsd: number }>('/admin/ai/usage'));
    } catch (e) {
      error = errorMessage(e);
    }
  }

  async function save(body: Record<string, unknown>) {
    busy = true;
    message = error = '';
    try {
      settings = await patch<AiSettings>('/admin/ai', body);
      message = t('common.saved');
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }

  async function saveForm(event: SubmitEvent) {
    event.preventDefault();
    if (!settings) return;
    // Empty means "no limit". Anything that is not a plain number is refused, never read as empty:
    // "5$" or "1.000" must not remove or shrink a limit behind a "Saved".
    const num = (s: string, int = false) => {
      const v = s.trim().replace(',', '.');
      if (!v) return null;
      return (int ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(v) ? Number(v) : undefined;
    };
    const body: Record<string, unknown> = {
      modelText: settings.modelText,
      modelPhoto: settings.modelPhoto,
      monthlyCapUsd: num(cap),
      dailyRequests: num(limits.dailyRequests, true),
      dailyTokens: num(limits.dailyTokens, true),
      perMinute: num(limits.perMinute, true),
      instanceMonthlyUsd: num(limits.instanceMonthlyUsd)
    };
    if (Object.values(body).includes(undefined)) {
      message = '';
      error = t('admin.aiInvalidNumber');
      return;
    }
    if (apiKey.trim()) body.apiKey = apiKey.trim();
    await save(body);
    apiKey = '';
  }

  async function test() {
    busy = true;
    message = error = '';
    try {
      const { result } = await post<{ result: 'ok' | 'invalid' | 'unreachable' }>('/admin/ai/test');
      message = t(`admin.aiTest.${result}`);
    } catch (e) {
      error = errorMessage(e);
    } finally {
      busy = false;
    }
  }
</script>

{#if settings}
  <section class="card stack" aria-labelledby="ai-title">
    <h2 id="ai-title" class="section-title">{t('admin.ai')}</h2>
    <p class="help">{t('admin.aiHelp')}</p>

    <label class="check">
      <input type="checkbox" checked={settings.enabled} disabled={busy} onchange={(e) => save({ enabled: e.currentTarget.checked })} />
      <span>{t('admin.aiEnabled')}</span>
    </label>

    <form class="stack" onsubmit={saveForm}>
      <div class="field">
        <label for="ai-key">{t('admin.aiKey')}</label>
        <input id="ai-key" type="password" autocomplete="off" placeholder="sk-ant-…" bind:value={apiKey} aria-describedby="ai-key-help" />
        <p id="ai-key-help" class="help">
          {settings.hasKey ? t('admin.aiKeySet', { hint: settings.keyHint ?? '' }) : ''}
          {t('admin.aiKeyHelp')}
        </p>
      </div>
      <div class="field">
        <label for="ai-mt">{t('admin.aiModelText')}</label>
        <select id="ai-mt" bind:value={settings.modelText}>
          {#each settings.models as m (m)}<option value={m}>{m}</option>{/each}
        </select>
      </div>
      <div class="field">
        <label for="ai-mp">{t('admin.aiModelPhoto')}</label>
        <select id="ai-mp" bind:value={settings.modelPhoto}>
          {#each settings.models as m (m)}<option value={m}>{m}</option>{/each}
        </select>
      </div>
      <fieldset class="limits">
        <legend class="label">{t('admin.aiLimits')}</legend>
        <p class="help">{t('admin.aiLimitsHelp')}</p>
        <div class="field">
          <label for="ai-dr">{t('admin.aiDailyRequests')}</label>
          <input id="ai-dr" inputmode="numeric" autocomplete="off" bind:value={limits.dailyRequests} />
        </div>
        <div class="field">
          <label for="ai-pm">{t('admin.aiPerMinute')}</label>
          <input id="ai-pm" inputmode="numeric" autocomplete="off" bind:value={limits.perMinute} />
        </div>
        <div class="field">
          <label for="ai-dt">{t('admin.aiDailyTokens')}</label>
          <input id="ai-dt" inputmode="numeric" autocomplete="off" bind:value={limits.dailyTokens} />
        </div>
        <div class="field">
          <label for="ai-cap">{t('admin.aiCap')}</label>
          <input id="ai-cap" inputmode="decimal" autocomplete="off" bind:value={cap} />
        </div>
        <div class="field">
          <label for="ai-ic">{t('admin.aiInstanceCap')}</label>
          <input id="ai-ic" inputmode="decimal" autocomplete="off" bind:value={limits.instanceMonthlyUsd} />
        </div>
      </fieldset>
      <div class="row">
        <button class="btn btn-primary" type="submit" disabled={busy}>{t('common.save')}</button>
        {#if settings.hasKey}
          <button class="btn" type="button" disabled={busy} onclick={test}>{t('admin.aiTest')}</button>
          <button class="btn btn-ghost" type="button" disabled={busy} onclick={() => save({ apiKey: null })}>{t('admin.aiKeyRemove')}</button>
        {/if}
      </div>
    </form>

    <label class="check">
      <input type="checkbox" checked={settings.keepPhotos} disabled={busy} onchange={(e) => save({ keepPhotos: e.currentTarget.checked })} />
      <span>{t('admin.aiKeepPhotos')}<br /><span class="muted small">{t('admin.aiKeepPhotosHelp')}</span></span>
    </label>

    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if message}<p class="notice" role="status">{message}</p>{/if}
    {#if settings.enabled && settings.instanceMonthlyUsd == null}<p class="error" role="alert">{t('admin.aiNoBudget')}</p>{/if}

    <h3 class="label">{t('admin.aiUsage')}</h3>
    {#if usage.length}
      <ul class="plain">
        {#each usage as r (`${r.userId}-${r.model}`)}
          <li class="list-row">
            <div class="grow">
              <p>{r.name}</p>
              <p class="muted small">{r.model} · {t('admin.aiRequests', { n: r.requests })}</p>
            </div>
            <span>{usd(r.costUsd)}</span>
          </li>
        {/each}
      </ul>
    {/if}
    {#if total > 0}
      <p class="small"><strong>{t('admin.aiTotal', { usd: usd(total) })}</strong></p>
    {:else}
      <p class="muted">{t('admin.aiUsageNone')}</p>
    {/if}
  </section>
{/if}

<style>
  .limits {
    border: none;
    margin: 0;
    padding: 0;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .limits legend {
    padding: 0;
    margin-bottom: 4px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .plain {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .grow {
    flex: 1;
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
