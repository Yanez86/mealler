// SPDX-License-Identifier: AGPL-3.0-or-later
// Offline support: new diary entries made without a connection wait in a local queue
// and are sent as soon as the network is back.
import { ApiError, post } from './api';

interface QueuedEntry {
  id: string;
  createdAt: string;
  body: Record<string, unknown> & { date: string };
}

export const net = $state({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pending: 0,
  /** Descriptions of queued entries the server refused: shown to the user, who can write them again. */
  rejected: [] as string[]
});

let userId: number | null = null;
const key = () => `mealler-queue-${userId ?? 'anon'}`;

function read(): QueuedEntry[] {
  try {
    return JSON.parse(localStorage.getItem(key()) ?? '[]') as QueuedEntry[];
  } catch {
    return [];
  }
}

/** False when the device could not keep the list (storage full or unavailable). */
function write(list: QueuedEntry[]): boolean {
  try {
    localStorage.setItem(key(), JSON.stringify(list));
  } catch {
    net.pending = read().length;
    return false;
  }
  net.pending = list.length;
  return true;
}

export function initOffline(currentUserId: number | null) {
  userId = currentUserId;
  net.pending = read().length;
}

/** An id for a new entry: the server saves an entry once, however many times it receives it. */
export const newClientId = (): string | undefined => crypto.randomUUID?.();

/** Keeps an entry for later. False when the device could not store it: the caller must say so. */
export function enqueueEntry(body: QueuedEntry['body']): boolean {
  const list = read();
  list.push({ id: String(body.clientId ?? Math.random()), createdAt: new Date().toISOString(), body });
  return write(list);
}

export function pendingFor(date: string): number {
  return read().filter((q) => q.body.date === date).length;
}

let flushing = false;

/** Sends queued entries in order. Returns how many were sent. */
export async function flushQueue(): Promise<number> {
  if (flushing || userId == null) return 0;
  flushing = true;
  let sent = 0;
  try {
    let list = read();
    while (list.length) {
      const [next] = list;
      try {
        await post('/entries', next.body);
        sent++;
      } catch (error) {
        // Not this entry's fault (no network, server down, signed out, too many requests): try again later.
        if (error instanceof ApiError && (error.code === 'offline' || error.status >= 500 || error.status === 401 || error.status === 429)) break;
        // Refused by the server (e.g. the slot no longer exists): out of the queue so it does not block
        // the others, and reported, never dropped in silence.
        net.rejected.push(String(next.body.description ?? '?'));
      }
      list = list.slice(1);
      write(list);
    }
  } finally {
    flushing = false;
  }
  return sent;
}

/** Removes cached API responses (called on logout so another account never sees them). */
export async function clearApiCache() {
  if (typeof caches === 'undefined') return;
  for (const name of await caches.keys()) if (name.startsWith('mealler-api')) await caches.delete(name);
}
