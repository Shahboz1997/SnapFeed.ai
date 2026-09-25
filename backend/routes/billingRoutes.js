import express from 'express';
import { protect } from '../middleware/supabaseAuth.js';
import {
  createLemonCheckout,
  fulfillLemonOrder,
  isLemonSqueezyConfigured,
  isLemonWebhookConfigured,
  resolveLemonFulfillmentId,
  verifyLemonWebhookSignature,
} from '../services/lemonSqueezy.js';

const router = express.Router();

const PAID_ORDER_STATUSES = new Set(['paid', 'active']);

/** POST /api/billing/checkout — create Lemon Squeezy checkout for a plan. */
router.post('/billing/checkout', protect, async (req, res, next) => {
  try {
    if (!isLemonSqueezyConfigured()) {
      return res.status(503).json({
        error: 'Card payments are not configured yet. Set LEMONSQUEEZY_* env vars.',
        messageKey: 'pricing.lemonNotConfigured',
      });
    }

    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Sign in required.',
        messageKey: 'pricing.authRequired',
      });
    }

    const planName = typeof req.body?.planName === 'string'
      ? req.body.planName.trim().toLowerCase()
      : '';

    const result = await createLemonCheckout({
      userId: req.user.id,
      email: req.user.email ?? null,
      planName,
      redirectUrl: typeof req.body?.redirectUrl === 'string' ? req.body.redirectUrl : undefined,
    });

    return res.json({
      success: true,
      checkoutUrl: result.checkoutUrl,
      planName: result.planName,
      credits: result.credits,
      amountUsd: result.amountUsd,
    });
  } catch (error) {
    if (error?.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message,
        messageKey: error.messageKey,
      });
    }
    return next(error);
  }
});

/**
 * POST /api/billing/webhook — Lemon Squeezy webhooks (raw body required for signature).
 * Mounted with express.raw in app.js.
 */
export async function lemonWebhookHandler(req, res) {
  try {
    if (!isLemonWebhookConfigured()) {
      console.warn('[lemon] webhook received but LEMONSQUEEZY_WEBHOOK_SECRET is not set');
      return res.status(503).json({ error: 'Webhook secret not configured.' });
    }

    const signature = req.headers['x-signature'];
    if (!signature || typeof signature !== 'string') {
      return res.status(401).json({ error: 'Missing signature.' });
    }

    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));

    if (!verifyLemonWebhookSignature(rawBody, signature)) {
      return res.status(401).json({ error: 'Invalid signature.' });
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    const eventName = payload?.meta?.event_name || '';
    const customData = payload?.meta?.custom_data || {};
    const attrs = payload?.data?.attributes || {};

    // One-time packs: order_created. Subscriptions: invoice success only.
    // Using a shared fulfillment id prevents double-grant when both fire.
    const shouldFulfill = eventName === 'order_created'
      || eventName === 'subscription_payment_success';

    if (!shouldFulfill) {
      return res.json({ ok: true, ignored: eventName });
    }

    // Allowlist paid statuses only — never fulfill unpaid/pending/unknown.
    if (eventName === 'order_created') {
      const status = String(attrs.status || '').toLowerCase().trim();
      if (!PAID_ORDER_STATUSES.has(status)) {
        return res.json({ ok: true, ignored: `order_status_${status || 'missing'}` });
      }
    }

    const firstItem = attrs.first_order_item || attrs.first_subscription_item || {};
    const variantId = firstItem.variant_id
      ?? attrs.variant_id
      ?? payload?.data?.relationships?.variant?.data?.id
      ?? null;

    const fulfillmentId = resolveLemonFulfillmentId(eventName, payload, attrs);
    if (!fulfillmentId) {
      console.warn('[lemon] could not resolve fulfillment id for event', eventName);
      return res.status(400).json({ error: 'Missing order identifier.' });
    }

    const result = await fulfillLemonOrder({
      orderId: fulfillmentId,
      userId: customData.user_id || customData.userId || null,
      planName: customData.plan || null,
      variantId,
      email: attrs.user_email || attrs.customer_email || null,
      rawEventName: eventName,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    console.error('[lemon] webhook error:', error?.message || error);
    const status = error?.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return res.status(status).json({
      error: error?.message || 'Webhook processing failed.',
    });
  }
}

router.get('/billing/status', (_req, res) => {
  res.json({
    lemonConfigured: isLemonSqueezyConfigured(),
    webhookConfigured: isLemonWebhookConfigured(),
  });
});

export default router;
