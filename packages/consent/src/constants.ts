export const CONSENT_LIFETIME_DAYS = 180;
export const CONSENT_LIFETIME_MS = CONSENT_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export function consentStorageKey(app: string): string {
  return `${app}:analytics-consent`;
}
