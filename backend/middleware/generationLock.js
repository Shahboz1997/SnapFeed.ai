import crypto from 'crypto';
import { resolveGuestKey } from '../services/guestCredits.js';
import { getClientIp } from '../utils/clientIp.js';

/** In-memory per-user/guest generation mutex (single Node process). */
const locks = new Map();

function readPositiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Must exceed GENERATION_TIMEOUT_MS so a crashed handler cannot leak the lock forever. */
const LOCK_TTL_MS = readPositiveInt('GENERATION_LOCK_TTL_MS', 150_000);

export function resolveGenerationLockKey(req) {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }

  const guestKey = req.guestKey || resolveGuestKey(req);
  if (guestKey) {
    return `guest:${guestKey}`;
  }

  const ip = getClientIp(req) || req.ip || 'unknown';
  return `ip:${ip}`;
}

export function releaseGenerationLock(req) {
  const key = req.generationLockKey;
  const token = req.generationLockToken;
  if (!key || !token) return;

  const current = locks.get(key);
  if (current && current.token === token) {
    locks.delete(key);
  }

  req.generationLockKey = undefined;
  req.generationLockToken = undefined;
}

/**
 * Reject a second in-flight generation (including OCR) for the same user/guest with 429.
 */
export function acquireGenerationLock(req, res, next) {
  const now = Date.now();
  const key = resolveGenerationLockKey(req);
  const existing = locks.get(key);

  if (existing && existing.expiresAt > now) {
    return res.status(429).json({
      error: 'A generation is already in progress. Please wait for it to finish.',
      messageKey: 'api.generationInProgress',
    });
  }

  const token = crypto.randomUUID();
  locks.set(key, { token, expiresAt: now + LOCK_TTL_MS });
  req.generationLockKey = key;
  req.generationLockToken = token;

  const releaseOnce = () => releaseGenerationLock(req);
  res.on('finish', releaseOnce);
  res.on('close', releaseOnce);

  return next();
}
