import { hasAnalyticsConsent } from '../constants/company';

export type AdsConversion = 'signup' | 'generate' | 'purchase';

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GOOGLE_TAG_ID = 'GT-KFGFRXD2';
const ADS_ID = (import.meta.env.VITE_GOOGLE_ADS_ID as string | undefined)?.trim() || '';

const CONSENT_GRANTED = {
  ad_storage: 'granted',
  ad_user_data: 'granted',
  ad_personalization: 'granted',
  analytics_storage: 'granted',
};

const CONVERSION_SEND_TO: Record<AdsConversion, string> = {
  signup: (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_SIGNUP as string | undefined)?.trim() || '',
  generate: (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_GENERATE as string | undefined)?.trim() || '',
  purchase: (import.meta.env.VITE_GOOGLE_ADS_CONVERSION_PURCHASE as string | undefined)?.trim() || '',
};

const DEDUPE_PREFIX = 'snapfeed_ads_conv_';

function canTrack(): boolean {
  return hasAnalyticsConsent() && typeof window !== 'undefined';
}

function ensureGtag(): void {
  window.dataLayer = window.dataLayer || [];
  if (!window.gtag) {
    window.gtag = (...args: unknown[]) => {
      window.dataLayer.push(args);
    };
  }
}

/** Grant Ads/analytics consent on the Google tag. Safe to call repeatedly. */
export function initGoogleAds(): void {
  if (!canTrack()) return;
  ensureGtag();
  window.gtag!('consent', 'update', CONSENT_GRANTED);

  const alreadyLoaded = Boolean(
    document.getElementById('google-ads-gtag') ||
      document.querySelector('script[src*="googletagmanager.com/gtag/js"]'),
  );
  if (alreadyLoaded) {
    if (ADS_ID && ADS_ID !== GOOGLE_TAG_ID) window.gtag!('config', ADS_ID);
    return;
  }

  window.gtag!('js', new Date());
  window.gtag!('config', GOOGLE_TAG_ID);
  if (ADS_ID && ADS_ID !== GOOGLE_TAG_ID) window.gtag!('config', ADS_ID);

  const script = document.createElement('script');
  script.id = 'google-ads-gtag';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_TAG_ID)}`;
  document.head.appendChild(script);
}

function markDedupe(key: string): boolean {
  try {
    const storageKey = `${DEDUPE_PREFIX}${key}`;
    if (sessionStorage.getItem(storageKey)) return false;
    sessionStorage.setItem(storageKey, '1');
    return true;
  } catch {
    return true;
  }
}

type ConversionParams = {
  value?: number;
  currency?: string;
  /** Dedupe within the tab session (e.g. signup once). */
  onceKey?: string;
};

/** Fire a Google Ads conversion if consent + IDs are configured. */
export function trackAdsConversion(
  kind: AdsConversion,
  params: ConversionParams = {},
): void {
  if (!canTrack()) return;
  initGoogleAds();
  if (!window.gtag) return;

  if (params.onceKey && !markDedupe(params.onceKey)) return;

  const sendTo = CONVERSION_SEND_TO[kind];
  const payload: Record<string, unknown> = {};
  if (typeof params.value === 'number') payload.value = params.value;
  if (params.currency) payload.currency = params.currency;

  if (sendTo) {
    window.gtag('event', 'conversion', { send_to: sendTo, ...payload });
  }

  // Always emit a named event for Ads/GA4 debugging when the tag is loaded.
  window.gtag('event', `snapfeed_${kind}`, payload);
}

export function isGoogleAdsConfigured(): boolean {
  return Boolean(GOOGLE_TAG_ID);
}
