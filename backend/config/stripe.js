import Stripe from 'stripe';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || '';

export function isStripeConfigured() {
  return Boolean(stripeSecretKey);
}

let stripeClient = null;

export function getStripe() {
  if (!isStripeConfigured()) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(stripeSecretKey);
  }

  return stripeClient;
}

export function getStripeWebhookSecret() {
  return process.env.STRIPE_WEBHOOK_SECRET?.trim() || '';
}

export function getFrontendUrl() {
  const configured = process.env.FRONTEND_URL?.trim()
    || process.env.CORS_ORIGIN?.split(',')[0]?.trim();

  return configured || 'http://localhost:5173';
}
