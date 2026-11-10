<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<!-- Achievement badge: the drawing with its medal (files in static/achievements), greyed out while locked. -->
<script module lang="ts">
  // Badge tint, taken from each drawing's main color.
  const tints: Record<string, string> = {
    scan1: '#0F766E', day1: '#0F766E', dish1: '#E04F3F', estimate1: '#F6C343', weight1: '#4D8FD1',
    label1: '#AEB8C3', favorite1: '#F6C343', streak3: '#F7A440', streak7: '#0F766E', streak30: '#0F766E',
    days100: '#F7A440', days365: '#0F766E', weights10: '#4D8FD1', weeks12: '#4D8FD1', inrange1: '#5BAA4A',
    inrange7: '#5BAA4A', rainbow: '#4E9E45', entries100: '#0F766E', entries1000: '#0F766E', scans50: '#0F766E',
    breakfast7: '#8A5530', connector: '#4D8FD1', midnight: '#F6C343'
  };
</script>

<script lang="ts">
  let { id, size = 56, locked = false }: { id: string; size?: number; locked?: boolean } = $props();
</script>

<span class="badge" class:locked style:--tint={tints[id]} style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <img src="/achievements/{id}.svg" alt="" draggable="false" />
</span>

<style>
  .badge {
    flex: none;
    display: inline-grid;
    place-items: center;
    border-radius: 50%;
    background: color-mix(in srgb, var(--tint) var(--food-tint, 16%), transparent);
  }
  img {
    width: 84%;
    height: 84%;
    display: block;
    user-select: none;
  }
  .locked {
    background: var(--surface-2);
  }
  .locked img {
    filter: grayscale(1);
    opacity: 0.38;
  }
</style>
