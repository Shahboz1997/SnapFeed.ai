export const COMPANY = {
  brand: 'snapfeed.help',
  siteUrl: 'https://snapfeed.help',
  legalName: 'ESD Media LLC',
  jurisdiction: 'Wyoming, USA',
  addressLine1: '30 N Gould St Ste N',
  addressLine2: 'Sheridan, WY 82801, USA',
  copyrightYear: 2026,
  governingLaw: 'State of Wyoming, United States',
} as const;

export const COMPANY_FULL_ADDRESS = `${COMPANY.addressLine1}, ${COMPANY.addressLine2}`;
export const COMPANY_SITE_HOST = 'snapfeed.help';

export const COOKIE_CONSENT_KEY = 'snapfeed_cookie_consent';

export type CookieConsentValue = 'accepted' | 'essential';

export function getCookieConsent(): CookieConsentValue | null {
  try {
    const value = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (value === 'accepted' || value === 'essential') return value;
  } catch {
    /* ignore */
  }
  return null;
}

export function hasAnalyticsConsent(): boolean {
  return getCookieConsent() === 'accepted';
}
