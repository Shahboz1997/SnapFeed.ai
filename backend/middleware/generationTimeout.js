import { releaseGenerationLock } from './generationLock.js';

function readPositiveInt(name, fallback) {
  const parsed = Number.parseInt(process.env[name] || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Hard ceiling for a single generation request (default 120s — FASHN often needs >45s). */
export const GENERATION_TIMEOUT_MS = readPositiveInt('GENERATION_TIMEOUT_MS', 120_000);

/**
 * Enforces a hard request timeout. On expiry: 504, release mutex, suppress further res.json
 * so a late FASHN success cannot double-write or charge credits.
 * Applies to OCR as well (OpenAI vision can hang under load).
 */
export function generationTimeoutGuard(req, res, next) {
  const timeoutMs = GENERATION_TIMEOUT_MS;
  const originalJson = res.json.bind(res);

  res.json = function guardedJson(body) {
    if (req.generationTimedOut) {
      return res;
    }
    return originalJson(body);
  };

  const timer = setTimeout(() => {
    if (req.generationTimedOut || res.headersSent) {
      releaseGenerationLock(req);
      return;
    }

    req.generationTimedOut = true;
    const lockKey = req.generationLockKey || 'n/a';
    releaseGenerationLock(req);

    console.warn(`[generation] timeout after ${timeoutMs}ms key=${lockKey}`);

    try {
      res.status(504);
      originalJson({
        error: 'Generation timed out. Please try again.',
        messageKey: 'api.generationTimeout',
      });
    } catch (error) {
      console.error('[generation] failed to send timeout response:', error?.message || error);
    }
  }, timeoutMs);

  const clear = () => clearTimeout(timer);
  res.on('finish', clear);
  res.on('close', clear);

  return next();
}
