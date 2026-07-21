// Keep in sync with frontend/src/constants/depositCurrency.ts
// Manual deposit amounts. Credits granted after admin approval.
// Target ≈ $0.25 / credit (API ≈ $0.07).
export const PRICING_TIERS = {
  single: {
    id: 'single',
    credits: 1,
    priceRub: 20,
    priceUsd: 0.25,
    priceUzs: 3000,
    priceTjs: 3,
    label: 'Single',
  },
  starter: {
    id: 'starter',
    credits: 10,
    priceRub: 200,
    priceUsd: 2.49,
    priceUzs: 30000,
    priceTjs: 25,
    label: 'Starter',
  },
  pro: {
    id: 'pro',
    credits: 50,
    priceRub: 999,
    priceUsd: 12.99,
    priceUzs: 150000,
    priceTjs: 130,
    label: 'Pro',
    popular: true,
  },
  business: {
    id: 'business',
    credits: 200,
    priceRub: 3499,
    priceUsd: 39.99,
    priceUzs: 480000,
    priceTjs: 400,
    label: 'Business',
  },
};

export const DEPOSIT_CURRENCIES = ['RUB', 'USD', 'UZS', 'TJS'];

export const LANG_TO_CURRENCY = {
  en: 'USD',
  ru: 'RUB',
  uz: 'UZS',
  tg: 'TJS',
};

export function normalizeDepositCurrency(value) {
  const raw = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return DEPOSIT_CURRENCIES.includes(raw) ? raw : 'RUB';
}

export function getPricingTier(tierId) {
  return PRICING_TIERS[tierId] ?? null;
}

export function listPricingTiers() {
  return Object.values(PRICING_TIERS);
}

export function formatTierAmount(tier, currency = 'RUB') {
  const code = normalizeDepositCurrency(currency);
  const key = {
    RUB: 'priceRub',
    USD: 'priceUsd',
    UZS: 'priceUzs',
    TJS: 'priceTjs',
  }[code];
  const value = Number(tier?.[key]);
  return Number.isFinite(value) ? value : 0;
}

export function formatTierAmountRub(tier) {
  return formatTierAmount(tier, 'RUB');
}

/** @deprecated Use formatTierAmount(tier, 'USD'). */
export function formatTierAmountUsd(tier) {
  return formatTierAmount(tier, 'USD');
}
