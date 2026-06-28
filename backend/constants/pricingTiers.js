// Keep in sync with frontend/src/components/PricingModal.tsx (TIERS).
// Cost basis: Replicate google/nano-banana-2 ≈ $0.07/gen (worst case, 1 credit = 1 gen).
// Price = cost / (1 - margin) → 50% margin: $0.07 / 0.50 = $0.14/gen.
export const PRICING_TIERS = {
  starter: {
    id: 'starter',
    credits: 10,
    priceUsd: 149,
    label: 'Starter',
  },
  pro: {
    id: 'pro',
    credits: 50,
    priceUsd: 699,
    label: 'Pro',
    popular: true,
  },
  business: {
    id: 'business',
    credits: 200,
    priceUsd: 2799,
    label: 'Business',
  },
};

export function getPricingTier(tierId) {
  return PRICING_TIERS[tierId] ?? null;
}

export function listPricingTiers() {
  return Object.values(PRICING_TIERS);
}
