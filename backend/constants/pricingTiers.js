// Keep in sync with frontend/src/components/PricingModal.tsx (TIERS).
// Manual deposit amounts (USD). Credits granted after admin approval.
export const PRICING_TIERS = {
  starter: {
    id: 'starter',
    credits: 10,
    priceUsd: 9,
    label: 'Starter',
  },
  pro: {
    id: 'pro',
    credits: 50,
    priceUsd: 29,
    label: 'Pro',
    popular: true,
  },
  business: {
    id: 'business',
    credits: 200,
    priceUsd: 99,
    label: 'Business',
  },
};

export function getPricingTier(tierId) {
  return PRICING_TIERS[tierId] ?? null;
}

export function listPricingTiers() {
  return Object.values(PRICING_TIERS);
}

export function formatTierAmountUsd(tier) {
  const value = Number(tier?.priceUsd ?? 0);
  return Number.isFinite(value) ? value : 0;
}
