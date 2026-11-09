// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional check for newer Mealler releases: reads the version on the main branch of the
// public repository at most every 12 hours. Disable with MEALLER_UPDATE_CHECK=false.

const SOURCE = 'https://raw.githubusercontent.com/Yanez86/mealler/main/package.json';
const EVERY_MS = 12 * 60 * 60 * 1000;

let latest: string | null = null;
let checkedAt = 0;
let inFlight = false;

async function refresh() {
  inFlight = true;
  try {
    const res = await fetch(SOURCE, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const version = ((await res.json()) as { version?: unknown }).version;
      if (typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)) latest = version;
    }
  } catch {
    // Offline or GitHub unreachable: keep the last known value.
  } finally {
    checkedAt = Date.now();
    inFlight = false;
  }
}

/** Returns the last known latest version without waiting; refreshes in the background when stale. */
export function latestVersion(enabled: boolean): string | null {
  if (!enabled) return null;
  if (!inFlight && Date.now() - checkedAt > EVERY_MS) void refresh();
  return latest;
}

