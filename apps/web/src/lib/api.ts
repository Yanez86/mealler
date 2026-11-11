// SPDX-License-Identifier: AGPL-3.0-or-later

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** What to do when the server no longer knows the session (expired, or closed from another device). Set by the app state. */
export const session = { expired: () => {} };

export async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    // Nothing was changed by a read that did not get through: only writes are "not saved".
    throw new ApiError(0, method === 'GET' ? 'unreachable' : 'offline');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = (data as { error?: string }).error ?? 'internal';
    if (response.status === 401 && code === 'unauthorized') session.expired();
    throw new ApiError(response.status, code);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body: unknown) => api<T>('PATCH', path, body);
export const put = <T>(path: string, body: unknown) => api<T>('PUT', path, body);
export const del = <T>(path: string) => api<T>('DELETE', path);

/** A POST that still reaches the server when the page is being hidden or closed. */
export function beacon(path: string, body: unknown) {
  void fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true
  }).catch(() => {});
}
