import { createError } from './errors.js';

export function isReplicateRateLimitError(error) {
  const message = error?.message || String(error || '');
  return /429|too many requests|throttl|rate limit/i.test(message);
}

export function parseReplicateRetryAfterMs(error, fallbackMs = 2000) {
  const message = error?.message || '';
  const retryAfterMatch = message.match(/"retry_after"\s*:\s*(\d+)/);
  if (retryAfterMatch) {
    return Number(retryAfterMatch[1]) * 1000 + 500;
  }

  const resetMatch = message.match(/resets in ~(\d+)s/i);
  if (resetMatch) {
    return Number(resetMatch[1]) * 1000 + 500;
  }

  return fallbackMs;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastReplicateCreateAt = 0;

function resolveReplicateBurstGapMs(overrideMs) {
  if (Number.isFinite(overrideMs) && overrideMs >= 0) {
    return overrideMs;
  }

  const configured = Number(process.env.REPLICATE_BURST_DELAY_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}

export async function waitForReplicateBurstGap(overrideMs) {
  const minGapMs = resolveReplicateBurstGapMs(overrideMs);
  if (minGapMs <= 0) {
    return;
  }

  const elapsed = Date.now() - lastReplicateCreateAt;
  if (elapsed < minGapMs) {
    const waitMs = minGapMs - elapsed;
    console.log(`[replicate] Waiting ${waitMs}ms before next prediction (burst limit)`);
    await sleep(waitMs);
  }
}

export function markReplicatePredictionCreated() {
  lastReplicateCreateAt = Date.now();
}

export async function runWithReplicateRateLimitRetry(
  runFn,
  { label = 'Replicate', maxRetries = 2, burstGapMs } = {},
) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await waitForReplicateBurstGap(burstGapMs);
      markReplicatePredictionCreated();
      return await runFn();
    } catch (error) {
      lastError = error;
      if (!isReplicateRateLimitError(error) || attempt >= maxRetries) {
        throw error;
      }

      const waitMs = parseReplicateRetryAfterMs(error);
      console.warn(`[replicate] ${label} throttled (429), retry ${attempt + 1}/${maxRetries} in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }

  throw lastError;
}

export function mapReplicateRateLimitError(error) {
  if (!isReplicateRateLimitError(error)) {
    return null;
  }

  const message = error?.message || '';
  const lowCredit = /less than \$5/i.test(message);

  if (lowCredit) {
    return createError(
      'Replicate: лимит запросов — на счёте меньше $5. Пополните баланс на replicate.com/account/billing '
      + 'или подождите 10–60 сек между генерациями (лимит: ~1 запрос/сек).',
      429,
    );
  }

  return createError(
    'Replicate: слишком много запросов. Подождите несколько секунд и повторите.',
    429,
  );
}
