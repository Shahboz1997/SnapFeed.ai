import crypto from 'crypto';
import { getPricingTier } from '../constants/pricingTiers.js';
import { getSupabaseAdmin } from '../config/supabase.js';
import { createError } from '../utils/errors.js';

const LEMON_API = 'https://api.lemonsqueezy.com/v1';

const PLAN_VARIANT_ENV = {
  single: 'LEMONSQUEEZY_VARIANT_SINGLE',
  starter: 'LEMONSQUEEZY_VARIANT_STARTER',
  pro: 'LEMONSQUEEZY_VARIANT_PRO',
  business: 'LEMONSQUEEZY_VARIANT_BUSINESS',
  monthly: 'LEMONSQUEEZY_VARIANT_MONTHLY',
};

export function isLemonSqueezyConfigured() {
  return Boolean(
    process.env.LEMONSQUEEZY_API_KEY?.trim()
    && process.env.LEMONSQUEEZY_STORE_ID?.trim()
    && Object.values(PLAN_VARIANT_ENV).some((key) => process.env[key]?.trim()),
  );
}

export function isLemonWebhookConfigured() {
  return Boolean(process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim());
}

function variantIdForPlan(planName) {
  const envKey = PLAN_VARIANT_ENV[planName];
  const id = envKey ? process.env[envKey]?.trim() : '';
  return id || null;
}

export function planCreditsForVariant(variantId) {
  const raw = String(variantId ?? '');
  for (const [plan, envKey] of Object.entries(PLAN_VARIANT_ENV)) {
    if (process.env[envKey]?.trim() === raw) {
      return getPricingTier(plan)?.credits ?? null;
    }
  }
  return null;
}

export function planNameForVariant(variantId) {
  const raw = String(variantId ?? '');
  for (const [plan, envKey] of Object.entries(PLAN_VARIANT_ENV)) {
    if (process.env[envKey]?.trim() === raw) return plan;
  }
  return null;
}

function allowedRedirectHosts() {
  const hosts = new Set(['snapfeed.help', 'www.snapfeed.help']);

  const appUrl = process.env.APP_PUBLIC_URL?.trim();
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).hostname);
    } catch {
      // ignore malformed APP_PUBLIC_URL
    }
  }

  const cors = process.env.CORS_ORIGIN || '';
  for (const origin of cors.split(',')) {
    const trimmed = origin.trim();
    if (!trimmed || trimmed === '*') continue;
    try {
      hosts.add(new URL(trimmed).hostname);
    } catch {
      // ignore
    }
  }

  return hosts;
}

/**
 * Only allow post-checkout redirects to known product hosts (open-redirect guard).
 */
export function sanitizeCheckoutRedirectUrl(redirectUrl) {
  const appUrl = (process.env.APP_PUBLIC_URL || 'https://snapfeed.help').replace(/\/$/, '');
  const fallback = `${appUrl}/cabinet?checkout=success`;

  if (!redirectUrl || typeof redirectUrl !== 'string') {
    return fallback;
  }

  try {
    const parsed = new URL(redirectUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return fallback;
    }

    const hosts = allowedRedirectHosts();
    const host = parsed.hostname.toLowerCase();
    if (
      hosts.has(host)
      || host.endsWith('.snapfeed.help')
      || host === 'localhost'
      || host === '127.0.0.1'
    ) {
      return parsed.toString();
    }
  } catch {
    // fall through
  }

  return fallback;
}

/**
 * Create a Lemon Squeezy checkout URL for an authenticated user + plan.
 * Requires products/variants created in the Lemon dashboard and variant IDs in env.
 */
export async function createLemonCheckout({
  userId,
  email,
  planName,
  redirectUrl,
}) {
  if (!isLemonSqueezyConfigured()) {
    throw createError('Lemon Squeezy is not configured.', 503, 'pricing.lemonNotConfigured');
  }

  const tier = getPricingTier(planName);
  if (!tier) {
    throw createError('Invalid plan name.', 400, 'pricing.invalidPlan');
  }

  const variantId = variantIdForPlan(tier.id);
  if (!variantId) {
    throw createError(
      `Variant ID missing for plan "${tier.id}". Set ${PLAN_VARIANT_ENV[tier.id]}.`,
      503,
      'pricing.lemonNotConfigured',
    );
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID.trim();
  const apiKey = process.env.LEMONSQUEEZY_API_KEY.trim();
  const safeRedirect = sanitizeCheckoutRedirectUrl(redirectUrl);

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_options: {
          embed: true,
          media: false,
          logo: true,
          desc: false,
          discount: true,
          dark: false,
          button_color: '#18181b',
        },
        checkout_data: {
          email: email || undefined,
          custom: {
            user_id: userId,
            plan: tier.id,
          },
        },
        product_options: {
          redirect_url: safeRedirect,
          receipt_button_text: 'Back to snapfeed.help',
          receipt_thank_you_note: 'Credits will appear in your account shortly.',
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: String(storeId) } },
        variant: { data: { type: 'variants', id: String(variantId) } },
      },
    },
  };

  const response = await fetch(`${LEMON_API}/checkouts`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || response.statusText;
    console.error('[lemon] create checkout failed:', response.status, detail);
    throw createError(
      detail || 'Failed to create Lemon Squeezy checkout.',
      502,
      'pricing.checkoutFailed',
    );
  }

  const checkoutUrl = payload?.data?.attributes?.url;
  if (!checkoutUrl) {
    throw createError('Lemon Squeezy returned no checkout URL.', 502, 'pricing.checkoutFailed');
  }

  return {
    checkoutUrl,
    planName: tier.id,
    credits: tier.credits,
    amountUsd: tier.priceUsd,
  };
}

export function verifyLemonWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  if (!signatureHeader || typeof signatureHeader !== 'string') return false;

  const digest = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(digest, 'utf8');
  const b = Buffer.from(signatureHeader.trim(), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Stable idempotency key shared across Lemon event types for the same payment.
 * Prefer order identifier so order_created + subscription_payment_success cannot double-grant.
 */
export function resolveLemonFulfillmentId(eventName, payload, attrs = {}) {
  const orderIdentifier = attrs.identifier != null ? String(attrs.identifier) : '';
  const orderId = attrs.order_id != null ? String(attrs.order_id) : '';
  const orderNumber = attrs.order_number != null ? String(attrs.order_number) : '';
  const dataId = payload?.data?.id != null ? String(payload.data.id) : '';

  if (eventName === 'subscription_payment_success') {
    // Invoice events: prefer linked order id; fall back to invoice id (prefixed).
    if (orderId) return `order_${orderId}`;
    if (orderIdentifier) return `order_${orderIdentifier}`;
    if (dataId) return `invoice_${dataId}`;
    return null;
  }

  // order_created (one-time packs)
  if (orderIdentifier) return `order_${orderIdentifier}`;
  if (orderNumber) return `order_num_${orderNumber}`;
  if (dataId) return `order_${dataId}`;
  return null;
}

async function addCreditsToUser(userId, credits) {
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId || credits <= 0) return null;

  const { data: rpcBalance, error: rpcError } = await supabase.rpc('add_profile_credits', {
    p_user_id: userId,
    p_amount: credits,
  });

  if (!rpcError && typeof rpcBalance === 'number') {
    return rpcBalance;
  }

  if (rpcError) {
    console.warn('[lemon] add_profile_credits RPC unavailable, falling back:', rpcError.message);
  }

  // Optimistic lock fallback (retry once on conflict).
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: profile, error: readError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .maybeSingle();

    if (readError) {
      console.error('[lemon] load profile for credit grant failed:', readError.message);
      throw createError('Failed to load profile for credit grant.', 500);
    }

    const current = Number(profile?.credits) || 0;
    const next = current + credits;

    const { data: updated, error: updateError } = await supabase
      .from('profiles')
      .update({ credits: next })
      .eq('id', userId)
      .eq('credits', current)
      .select('credits')
      .maybeSingle();

    if (!updateError && updated) {
      return updated.credits ?? next;
    }

    if (updateError) {
      console.error('[lemon] credit grant failed:', updateError.message);
      throw createError('Failed to grant credits.', 500);
    }
  }

  throw createError('Failed to grant credits (concurrent update).', 500);
}

/**
 * Idempotent credit grant from Lemon order_created / subscription_payment_success.
 * Prefer atomic RPC (ledger + credits). Fail closed if lemon_orders is missing.
 */
export async function fulfillLemonOrder({
  orderId,
  userId,
  planName,
  variantId,
  credits,
  email,
  rawEventName,
}) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw createError('Supabase is not configured.', 503);
  }

  const resolvedPlan = planName || planNameForVariant(variantId);
  const resolvedCredits = credits
    ?? (resolvedPlan ? getPricingTier(resolvedPlan)?.credits : null)
    ?? planCreditsForVariant(variantId);

  if (!userId) {
    console.warn('[lemon] webhook missing user_id custom data; order=', orderId, 'email=', email);
    return { granted: false, reason: 'missing_user' };
  }

  if (!resolvedCredits || resolvedCredits <= 0) {
    console.warn('[lemon] unknown variant/credits for order=', orderId, 'variant=', variantId);
    return { granted: false, reason: 'unknown_variant' };
  }

  if (!orderId) {
    console.warn('[lemon] webhook missing fulfillment id; user=', userId);
    return { granted: false, reason: 'missing_order_id' };
  }

  const fulfillmentId = String(orderId);

  // Atomic path: insert ledger + grant credits in one DB transaction.
  const { data: rpcResult, error: rpcError } = await supabase.rpc('fulfill_lemon_order', {
    p_order_id: fulfillmentId,
    p_user_id: userId,
    p_plan_name: resolvedPlan || 'unknown',
    p_credits: resolvedCredits,
    p_variant_id: variantId ? String(variantId) : null,
    p_event_name: rawEventName || null,
  });

  if (!rpcError && rpcResult && typeof rpcResult === 'object') {
    if (rpcResult.granted) {
      console.log(
        `[lemon] granted ${resolvedCredits} credits to ${userId} (order=${fulfillmentId}, plan=${resolvedPlan}, balance=${rpcResult.balance})`,
      );
    }
    return {
      granted: Boolean(rpcResult.granted),
      reason: rpcResult.reason || undefined,
      credits: rpcResult.credits ?? resolvedCredits,
      balance: rpcResult.balance,
      planName: rpcResult.planName || resolvedPlan,
    };
  }

  if (rpcError) {
    const missingFn = rpcError.code === 'PGRST202'
      || /fulfill_lemon_order/i.test(rpcError.message || '')
      || /could not find the function/i.test(rpcError.message || '');

    const missingTable = rpcError.code === '42P01'
      || rpcError.code === 'PGRST205'
      || /lemon_orders/i.test(rpcError.message || '');

    if (missingTable) {
      console.error(
        '[lemon] lemon_orders table missing — refuse to grant without idempotency. Run supabase/migrations/016_lemon_orders.sql',
      );
      throw createError('Payment ledger unavailable. Credits not granted.', 503);
    }

    if (!missingFn) {
      console.error('[lemon] fulfill_lemon_order RPC failed:', rpcError.message);
      throw createError('Failed to fulfill Lemon order.', 500);
    }

    console.warn('[lemon] fulfill_lemon_order RPC missing; using ledger+grant fallback:', rpcError.message);
  }

  // Fallback when RPC not yet migrated: insert ledger first, then atomic add.
  const { error: insertError } = await supabase
    .from('lemon_orders')
    .insert({
      lemon_order_id: fulfillmentId,
      user_id: userId,
      plan_name: resolvedPlan || 'unknown',
      credits: resolvedCredits,
      variant_id: variantId ? String(variantId) : null,
      event_name: rawEventName || null,
    });

  if (insertError) {
    if (insertError.code === '23505') {
      return { granted: false, reason: 'already_fulfilled', credits: resolvedCredits };
    }

    if (
      insertError.code === '42P01'
      || insertError.code === 'PGRST205'
      || /lemon_orders/i.test(insertError.message || '')
    ) {
      console.error(
        '[lemon] lemon_orders table missing — refuse to grant without idempotency. Run supabase/migrations/016_lemon_orders.sql',
      );
      throw createError('Payment ledger unavailable. Credits not granted.', 503);
    }

    console.error('[lemon] lemon_orders insert failed:', insertError.message);
    throw createError('Failed to record Lemon order.', 500);
  }

  try {
    const newBalance = await addCreditsToUser(userId, resolvedCredits);
    console.log(
      `[lemon] granted ${resolvedCredits} credits to ${userId} (order=${fulfillmentId}, plan=${resolvedPlan}, balance=${newBalance})`,
    );

    return {
      granted: true,
      credits: resolvedCredits,
      balance: newBalance,
      planName: resolvedPlan,
    };
  } catch (grantError) {
    // Roll back ledger row so Lemon retry can succeed instead of already_fulfilled with $0 credits.
    const { error: deleteError } = await supabase
      .from('lemon_orders')
      .delete()
      .eq('lemon_order_id', fulfillmentId);

    if (deleteError) {
      console.error(
        '[lemon] CRITICAL: grant failed and ledger rollback failed. Manual reconcile needed.',
        fulfillmentId,
        grantError?.message || grantError,
        deleteError.message,
      );
    }

    throw grantError;
  }
}
