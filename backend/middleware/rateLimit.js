import rateLimit from 'express-rate-limit';
import { resolveGuestKey } from '../services/guestCredits.js';
import { getClientIp } from '../utils/clientIp.js';

const isProduction = process.env.NODE_ENV === 'production';

function readPositiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function rateLimitHandler(_req, res) {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
    messageKey: 'api.rateLimited',
  });
}

/** Prefer authenticated user / guest fingerprint over shared NAT IPs. */
export function generateRateLimitKey(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const guestKey = resolveGuestKey(req);
  if (guestKey) {
    return `guest:${guestKey}`;
  }

  return `ip:${getClientIp(req) || 'unknown'}`;
}

/** Broad shield for all /api traffic. */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Costly generation endpoints (FASHN / Replicate / OpenAI).
 * Default: 3 requests / 60s per user or guest (override via env).
 * Must run after optionalAuth so req.user is available.
 */
export const generateRateLimiter = rateLimit({
  windowMs: readPositiveInt('GENERATION_RATE_WINDOW_MS', 60 * 1000),
  max: readPositiveInt('GENERATION_RATE_MAX', isProduction ? 3 : 60),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: generateRateLimitKey,
  handler: rateLimitHandler,
});

/** Chat / prompt assistant (OpenAI, no credit gate today). */
export const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 60 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
