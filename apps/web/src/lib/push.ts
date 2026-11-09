// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser side of Web Push: subscribe this device and hand the subscription to the server.
import { get, post } from './api';

export type PushSupport = 'ok' | 'insecure' | 'unsupported' | 'ios-not-installed';

export function pushSupport(): PushSupport {
  if (!window.isSecureContext) return 'insecure';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (ios && !standalone) return 'ios-not-installed';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'ok';
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

/** Asks for permission (must run from a user gesture) and registers this device. */
export async function subscribe(): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission;
  const registration = await navigator.serviceWorker.ready;
  const { publicKey } = await get<{ publicKey: string }>('/push/key');
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }
  await post('/push/subscribe', subscription.toJSON());
  return permission;
}

export async function unsubscribe(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

/** Re-sends an existing subscription after login, so a device keeps receiving reminders. */
export async function refreshSubscription(): Promise<void> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  const subscription = await currentSubscription().catch(() => null);
  if (subscription) await post('/push/subscribe', subscription.toJSON()).catch(() => {});
}
