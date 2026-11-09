<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- "What's new": the project changelog, bundled at build time. -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { User } from '@mealler/shared';
  import changelog from '../../../../../CHANGELOG.md?raw';
  import { patch } from '$lib/api';
  import { app, formatDate, setUser, t } from '$lib/state.svelte';
  import Icon from '$lib/Icon.svelte';
  import TopBar from '$lib/TopBar.svelte';

  interface Release {
    version: string;
    date: string | null;
    groups: { title: string; items: string[] }[];
  }

  function parse(md: string): Release[] {
    const releases: Release[] = [];
    for (const block of md.split(/^## \[/m).slice(1)) {
      const [head, ...lines] = block.split('\n');
      const match = /^([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/.exec(head);
      if (!match || !/^\d/.test(match[1])) continue;
      const release: Release = { version: match[1], date: match[2] ?? null, groups: [] };
      for (const line of lines) {
        if (line.startsWith('### ')) release.groups.push({ title: line.slice(4).trim(), items: [] });
        else if (line.startsWith('- ') && release.groups.length) {
          release.groups[release.groups.length - 1].items.push(line.slice(2).replace(/`/g, '').trim());
        }
      }
      releases.push(release);
    }
    return releases;
  }

  const releases = parse(changelog);

  onMount(async () => {
    const version = app.status?.version;
    if (version && version !== 'dev' && app.user?.lastSeenVersion !== version) {
      setUser(await patch<User>('/me', { lastSeenVersion: version }).catch(() => app.user));
    }
  });
</script>

<svelte:head><title>{t('news.title')} · Mealler</title></svelte:head>

<main class="page stack">
  <TopBar title={t('news.title')}>
    {#snippet actions()}
      <a class="icon-btn" href="/profile" aria-label={t('common.back')}><Icon name="left" /></a>
    {/snippet}
  </TopBar>

  {#each releases as release (release.version)}
    <article class="card stack">
      <header>
        <h2 class="section-title">{t('common.version', { v: release.version })}</h2>
        {#if release.date}<p class="muted small">{formatDate(release.date, { day: 'numeric', month: 'long', year: 'numeric' })}</p>{/if}
      </header>
      {#each release.groups as group (group.title)}
        <section>
          <h3 class="label">{group.title}</h3>
          <ul>
            {#each group.items as item, i (i)}<li>{item}</li>{/each}
          </ul>
        </section>
      {/each}
    </article>
  {/each}
</main>

<style>
  ul {
    margin: 6px 0 0;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    line-height: 1.45;
  }
</style>
