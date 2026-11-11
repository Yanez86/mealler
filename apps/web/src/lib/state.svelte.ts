// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  DEFAULT_LOCALE,
  isLocale,
  parseNumber as parseNumberIn,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Status,
  type Theme,
  type User
} from '@mealler/shared';
import { ApiError, session } from './api';
import { flushQueue, initOffline } from './offline.svelte';
import { refreshSubscription } from './push';

// "Meat-free" is remembered on the device too, so the start-up screen (before the account is known) follows it.
const MEAT_FREE = 'mealler-meat-free';
function storedMeatFree(): boolean {
  try {
    return localStorage.getItem(MEAT_FREE) === '1';
  } catch {
    return false;
  }
}

export const app = $state<{ status: Status | null; user: User | null; locale: Locale; meatFree: boolean }>({
  status: null,
  user: null,
  locale: guessLocale(),
  meatFree: typeof localStorage === 'undefined' ? false : storedMeatFree()
});

/**
 * The time as the pages see it: it moves on once a minute and when the app comes back to the foreground,
 * so "today" follows the calendar in an app left open overnight. `resumed` counts the returns: pages
 * read it to load their data again.
 */
export const clock = $state({ now: Date.now(), resumed: 0 });
if (typeof document !== 'undefined') {
  setInterval(() => (clock.now = Date.now()), 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    clock.now = Date.now();
    clock.resumed++;
  });
}

// Session expired: back to the login page (the layout remembers where the user was).
session.expired = () => {
  if (app.user) setUser(null);
};

function guessLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE;
  const lang = navigator.language?.slice(0, 2);
  return isLocale(lang) ? lang : DEFAULT_LOCALE;
}

export function t(key: MessageKey, params?: MessageParams): string {
  return translate(app.locale, key, params);
}

export function setUser(user: User | null) {
  app.user = user;
  initOffline(user?.id ?? null);
  if (user) {
    app.locale = user.locale;
    app.meatFree = user.meatFree;
    try {
      localStorage.setItem(MEAT_FREE, user.meatFree ? '1' : '0');
    } catch {
      // Storage unavailable: the start-up screen simply shows the default pictures.
    }
    applyTheme(user.theme);
    void flushQueue();
    void refreshSubscription();
  }
  document.documentElement.lang = app.locale;
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/** Translates an API error code into a user-facing message. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'offline':
        return t('common.offline');
      case 'unreachable':
        return t('error.unreachable');
      case 'unauthorized':
        return t('error.sessionExpired');
      case 'invalidCredentials':
        return t('login.invalid');
      case 'emailTaken':
        return t('error.emailTaken');
      case 'validation':
        return t('error.validation');
      case 'forbidden':
        return t('error.forbidden');
      case 'lastAdmin':
        return t('error.lastAdmin');
      case 'notFound':
        return t('error.notFound');
      case 'tooMany':
        return t('error.tooMany');
      case 'wrongPassword':
        return t('profile.wrongPassword');
      case 'invalidInvite':
      case 'inviteEmailMismatch':
        return t('register.invalidInvite');
      case 'invalidReset':
        return t('reset.invalid');
      case 'registrationClosed':
        return t('register.closed');
      case 'thresholdRange':
        return t('thresholds.invalid');
      case 'aiDisabled':
        return t('error.aiDisabled');
      case 'aiKeyInvalid':
        return t('error.aiKeyInvalid');
      case 'aiBusy':
        return t('error.aiBusy');
      case 'aiFailed':
        return t('error.aiFailed');
      case 'aiRefused':
        return t('error.aiRefused');
      case 'aiTruncated':
        return t('error.aiTruncated');
      case 'aiCapReached':
        return t('ai.capReached');
      case 'aiDailyLimit':
        return t('error.aiDailyLimit');
      case 'aiTooFast':
        return t('error.aiTooFast');
      case 'aiInstanceCap':
        return t('error.aiInstanceCap');
      case 'barcodeTaken':
        return t('error.barcodeTaken');
      case 'labelUnreadable':
        return t('error.labelUnreadable');
      case 'connectorDisabled':
        return t('connector.disabled');
      case 'invalidOAuthRequest':
        return t('consent.invalid');
    }
  }
  // Unexpected errors carry their detail, so a report says what actually broke.
  if (error instanceof ApiError) return `${t('common.error')} (${error.status} ${error.code})`;
  return error instanceof Error ? `${t('common.error')} (${error.message})` : t('common.error');
}

/** A number typed in a form, read in the user's language: null when empty, undefined when it is not a number. */
export const parseNumber = (text: string) => parseNumberIn(text, app.locale);

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(app.locale, { maximumFractionDigits: digits }).format(value);
}

export function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(app.locale, { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
