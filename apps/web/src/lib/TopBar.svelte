<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Top bar shared by every screen: top-left the logo, which links back to the Diary, or on the Trends,
     Favorites and Profile sections (Profile's inner pages included) that section's drawing. -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import Logo from './Logo.svelte';
  import SectionIcon from './SectionIcon.svelte';
  import { t } from './state.svelte';

  let {
    title,
    subtitle = '',
    actions,
    ontitle,
    titleLabel = '',
    section
  }: {
    title: string;
    subtitle?: string;
    actions?: Snippet;
    /** Makes the title and subtitle a button (e.g. the day opens the calendar). */
    ontitle?: () => void;
    titleLabel?: string;
    /** Shows the section's drawing instead of the logo. */
    section?: 'trends' | 'favorites' | 'profile';
  } = $props();
</script>

<header class="topbar">
  {#if section}
    <span class="home"><SectionIcon {section} size={40} /></span>
  {:else}
    <a class="home" href="/" aria-label={t('nav.home')}><Logo size={40} /></a>
  {/if}
  <div class="titles">
    <h1>{title}{#if ontitle}<span class="more"><Icon name="chevron" size={18} stroke={2.5} /></span>{/if}</h1>
    {#if subtitle}<p class="muted">{subtitle}</p>{/if}
    {#if ontitle}
      <!-- Covers title and subtitle, so a tap on either opens what the page offers. -->
      <button class="hit" type="button" aria-haspopup="dialog" aria-label="{title}, {subtitle}. {titleLabel}" onclick={ontitle}></button>
    {/if}
  </div>
  {#if actions}<div class="actions">{@render actions()}</div>{/if}
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: 4px;
    /* Clear of the iPhone status bar blur (see --status-clear); elsewhere 16px. */
    padding: max(16px, var(--status-clear)) 0 12px;
  }
  .home {
    flex: none;
    width: 48px;
    height: 48px;
    margin-left: -4px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .titles {
    position: relative;
    flex: 1;
    min-width: 0;
    padding-left: 4px;
  }
  .hit {
    position: absolute;
    inset: -4px 0;
    width: 100%;
    border: none;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
  }
  .more {
    display: inline-flex;
    vertical-align: middle;
    margin-left: 4px;
    color: var(--text-2);
    transform: rotate(90deg);
  }
  h1 {
    font-size: 26px;
    line-height: 32px;
    font-weight: 700;
  }
  h1,
  p {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  p {
    font-size: 15px;
    line-height: 20px;
  }
  .actions {
    display: flex;
    gap: 4px;
  }
</style>
