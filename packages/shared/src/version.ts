// SPDX-License-Identifier: AGPL-3.0-or-later

/** True when `candidate` is a higher x.y.z version than `current`. */
export function isNewerVersion(candidate: string | null | undefined, current: string): boolean {
  const re = /^\d+\.\d+\.\d+$/;
  if (!candidate || !re.test(candidate) || !re.test(current)) return false;
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
