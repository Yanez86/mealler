// SPDX-License-Identifier: AGPL-3.0-or-later
// The project changelog, bundled at build time: the News page and the popup after an update read it.
import { isNewerVersion } from '@mealler/shared';
import changelog from '../../../../CHANGELOG.md?raw';

export interface Release {
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

/** Every release, newest first. */
export const RELEASES = parse(changelog);

/** What changed since the version the user last saw, up to the running one (just the latest for a new account). */
export function releasesSince(seen: string | null | undefined, current: string): Release[] {
  const upTo = RELEASES.filter((r) => !isNewerVersion(r.version, current));
  if (!seen) return upTo.slice(0, 1);
  const newer = upTo.filter((r) => isNewerVersion(r.version, seen));
  return newer.length ? newer : upTo.slice(0, 1);
}
