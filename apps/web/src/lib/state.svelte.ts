// SPDX-License-Identifier: AGPL-3.0-or-later
import {
  DEFAULT_LOCALE,
  isLocale,
  translate,
  type Locale,
  type MessageKey,
  type MessageParams,
  type Status,
  type Theme,
  type User
} from '@mealler/shared';
import { ApiError } from './api';
import { flushQueue, initOffline } from './offline.svelte';
import { refreshSubscription } from './push';

export const app = $state<{ status: Status | null; user: User | null; locale: Locale }>({
  status: null,
  user: null,
  locale: guessLocale()
});

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
  return t('common.error');
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(app.locale, { maximumFractionDigits: digits }).format(value);
}

export function formatDate(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(app.locale, { ...options, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
}
