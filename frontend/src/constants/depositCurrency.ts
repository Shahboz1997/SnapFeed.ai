/** Locale ↔ currency pairing for SnapFeed UI languages. */
export const DEPOSIT_CURRENCIES = ['RUB', 'USD', 'UZS', 'TJS'] as const;
export type DepositCurrency = (typeof DEPOSIT_CURRENCIES)[number];

export const UI_LANGS = ['en', 'ru', 'uz', 'tg'] as const;
export type UiLang = (typeof UI_LANGS)[number];

export const LANG_TO_CURRENCY: Record<UiLang, DepositCurrency> = {
  en: 'USD',
  ru: 'RUB',
  uz: 'UZS',
  tg: 'TJS',
};

export const CURRENCY_TO_LANG: Record<DepositCurrency, UiLang> = {
  USD: 'en',
  RUB: 'ru',
  UZS: 'uz',
  TJS: 'tg',
};

export function normalizeUiLang(lang: string | undefined | null): UiLang {
  const code = (lang || 'en').split('-')[0].toLowerCase();
  return (UI_LANGS as readonly string[]).includes(code) ? (code as UiLang) : 'en';
}

export function currencyFromLang(lang: string | undefined | null): DepositCurrency {
  return LANG_TO_CURRENCY[normalizeUiLang(lang)];
}

export function langFromCurrency(currency: DepositCurrency): UiLang {
  return CURRENCY_TO_LANG[currency] ?? 'en';
}

export function normalizeDepositCurrency(value: string | undefined | null): DepositCurrency {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (DEPOSIT_CURRENCIES as readonly string[]).includes(raw)
    ? (raw as DepositCurrency)
    : 'RUB';
}

/** Keep in sync with backend/constants/pricingTiers.js */
export type PricingTierPrices = {
  id: 'single' | 'starter' | 'pro' | 'business';
  credits: number;
  priceRub: number;
  priceUsd: number;
  priceUzs: number;
  priceTjs: number;
  popular?: boolean;
};

export const PRICING_TIERS: PricingTierPrices[] = [
  { id: 'single', credits: 1, priceRub: 20, priceUsd: 0.25, priceUzs: 3000, priceTjs: 3 },
  { id: 'starter', credits: 10, priceRub: 200, priceUsd: 2.49, priceUzs: 30000, priceTjs: 25 },
  { id: 'pro', credits: 50, priceRub: 999, priceUsd: 12.99, priceUzs: 150000, priceTjs: 130, popular: true },
  { id: 'business', credits: 200, priceRub: 3499, priceUsd: 39.99, priceUzs: 480000, priceTjs: 400 },
];

export function tierAmountForCurrency(
  tier: Pick<PricingTierPrices, 'priceRub' | 'priceUsd' | 'priceUzs' | 'priceTjs'>,
  currency: DepositCurrency,
): number {
  switch (currency) {
    case 'USD':
      return tier.priceUsd;
    case 'UZS':
      return tier.priceUzs;
    case 'TJS':
      return tier.priceTjs;
    case 'RUB':
    default:
      return tier.priceRub;
  }
}

export function formatDepositAmount(amount: number, currency: DepositCurrency = 'RUB'): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return String(amount);

  switch (currency) {
    case 'USD':
      return `$${value.toFixed(2)}`;
    case 'UZS':
      return `${Math.round(value).toLocaleString('uz-UZ')} soʻm`;
    case 'TJS':
      return value % 1 === 0
        ? `${value} с.`
        : `${value.toFixed(2)} с.`;
    case 'RUB':
    default:
      return Number.isInteger(value) ? `₽${value}` : `₽${value.toFixed(2)}`;
  }
}

export function formatPerCredit(amount: number, currency: DepositCurrency): string {
  switch (currency) {
    case 'USD':
      return `$${amount.toFixed(2)}`;
    case 'UZS':
      return `${Math.round(amount).toLocaleString('uz-UZ')} soʻm`;
    case 'TJS':
      return amount % 1 === 0 ? `${amount} с.` : `${amount.toFixed(2)} с.`;
    case 'RUB':
    default:
      return `₽${Math.round(amount)}`;
  }
}

/**
 * Extract a card PAN from free-form payment details (digits only).
 * Prefers 16-digit Visa/MC-style numbers over shorter phone digits.
 */
export function extractPaymentCardNumber(paymentDetails: string): string | null {
  const text = typeof paymentDetails === 'string' ? paymentDetails : '';
  if (!text.trim()) return null;

  const candidates: string[] = [];
  const grouped = text.match(/(?:\d[\s-]*){13,19}/g) ?? [];
  for (const match of grouped) {
    const digits = match.replace(/\D/g, '');
    if (digits.length >= 13 && digits.length <= 19) {
      candidates.push(digits);
    }
  }

  if (candidates.length === 0) return null;

  // Prefer classic 16-digit cards when several numbers appear (card + phone).
  const sixteen = candidates.find((n) => n.length === 16);
  return sixteen ?? candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

const CLIENT_PAYMENT_ENV: Record<DepositCurrency, string> = {
  RUB: 'VITE_MANUAL_PAYMENT_DETAILS',
  USD: 'VITE_MANUAL_PAYMENT_DETAILS_USD',
  UZS: 'VITE_MANUAL_PAYMENT_DETAILS_UZS',
  TJS: 'VITE_MANUAL_PAYMENT_DETAILS_TJS',
};

/** Public payment instructions shown before “I paid” (override via VITE_MANUAL_PAYMENT_DETAILS*). */
const DEFAULT_CLIENT_PAYMENT_DETAILS: Record<DepositCurrency, string> = {
  RUB: [
    'Карта Visa (Ориёнбанк): 4167560008784260',
    'Телефон / перевод: +992931633999',
    'Получатель: Райимкулов Шахбоз',
    'Переведите точную сумму. В комментарии укажите email аккаунта SnapFeed.ai.',
    'После перевода нажмите «Я оплатил».',
  ].join('\n'),
  USD: [
    'Visa card (Oriyonbank): 4167560008784260',
    'Phone / transfer: +992931633999',
    'Recipient: Raimkulov Shahboz',
    'Transfer the exact USD amount. Include your SnapFeed.ai email in the payment note.',
    'Then tap "I paid".',
  ].join('\n'),
  UZS: [
    'Visa karta (Oriyonbank): 4167560008784260',
    'Telefon / o\'tkazma: +992931633999',
    'Oluvchi: Raimkulov Shahboz',
    'Aniq so\'m summasini o\'tkazing. Izohga SnapFeed.ai emailingizni yozing.',
    'So\'ng «To\'ladim» tugmasini bosing.',
  ].join('\n'),
  TJS: [
    'Корти Visa (Ориёнбанк): 4167560008784260',
    'Телефон / интиқол: +992931633999',
    'Гиранда: Райимкулов Шахбоз',
    'Маблағи дақиқро гузаронед. Дар шарҳ email-и SnapFeed.ai-ро нависед.',
    'Сипас «Ман пардохт кардам»-ро пахш кунед.',
  ].join('\n'),
};

export function getClientPaymentDetails(currency: DepositCurrency = 'RUB'): string {
  const code = normalizeDepositCurrency(currency);
  const envName = CLIENT_PAYMENT_ENV[code];
  const fromEnv = String(import.meta.env[envName] ?? import.meta.env.VITE_MANUAL_PAYMENT_DETAILS ?? '')
    .trim()
    .replace(/\\n/g, '\n');
  if (fromEnv) return fromEnv;
  return DEFAULT_CLIENT_PAYMENT_DETAILS[code];
}

export function tierLabel(tierId: PricingTierPrices['id']): string {
  return tierId.charAt(0).toUpperCase() + tierId.slice(1);
}
