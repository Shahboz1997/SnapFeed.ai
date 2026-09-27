/** @deprecated Prefer POST_AUTH_FIRST_SUCCESS_KEY — post-login goes to Studio first. */
export const POST_AUTH_MODAL_KEY = 'snapfeed_post_auth_modal';

/** After Google OAuth: land in Studio for first success (not pricing). */
export const POST_AUTH_FIRST_SUCCESS_KEY = 'snapfeed_post_auth_first_success';

export const REFERRAL_CODE_STORAGE_KEY = 'snapfeed_referral_code';

/** Landing pack click → resume Lemon checkout after OAuth redirect. */
export const PENDING_CHECKOUT_PLAN_KEY = 'snapfeed_pending_checkout_plan';

const CHECKOUT_PLAN_IDS = new Set(['single', 'starter', 'pro', 'business', 'monthly']);

export type PendingCheckoutPlanId = 'single' | 'starter' | 'pro' | 'business' | 'monthly';

export function writePendingCheckoutPlan(planId: string): void {
  if (!CHECKOUT_PLAN_IDS.has(planId)) return;
  try {
    sessionStorage.setItem(PENDING_CHECKOUT_PLAN_KEY, planId);
  } catch {
    // private mode / quota
  }
}

export function readPendingCheckoutPlan(): PendingCheckoutPlanId | null {
  try {
    const value = sessionStorage.getItem(PENDING_CHECKOUT_PLAN_KEY);
    if (!value || !CHECKOUT_PLAN_IDS.has(value)) return null;
    return value as PendingCheckoutPlanId;
  } catch {
    return null;
  }
}

export function clearPendingCheckoutPlan(): void {
  try {
    sessionStorage.removeItem(PENDING_CHECKOUT_PLAN_KEY);
  } catch {
    // ignore
  }
}
