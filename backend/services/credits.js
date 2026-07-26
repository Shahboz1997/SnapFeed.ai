import { normalizeCreditCost } from '../constants/generationCredits.js';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { createError } from '../utils/errors.js';
import { consumeGuestCredit, isGuestCreditsEnabled } from './guestCredits.js';

const CREDIT_RETRY_ATTEMPTS = 3;
const CREDIT_RETRY_BASE_MS = 400;

export function isCreditsEnabled() {
  return isSupabaseConfigured();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code,
    error.cause?.message,
    error.cause?.code,
  ].filter(Boolean);
  return parts.join(' ');
}

function isTransientSupabaseError(error) {
  const text = errorText(error).toLowerCase();
  return (
    error?.name === 'TypeError'
    || /fetch failed|network|timeout|timed out|econnreset|econnrefused|enotfound|socket|und_err|connect timeout|503|502|504|cloudflare/i.test(text)
  );
}

function isRpcMissingError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || /consume_profile_credits/i.test(message);
}

async function getCreditsOnce(supabase, userId) {
  let data;
  let error;

  try {
    ({ data, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .maybeSingle());
  } catch (thrown) {
    if (isTransientSupabaseError(thrown)) {
      throw thrown;
    }
    console.error('[credits] getCredits threw:', errorText(thrown));
    throw createError('Failed to load user credits.', 500);
  }

  if (error) {
    if (isTransientSupabaseError(error)) {
      throw error;
    }
    console.error('[credits] getCredits failed:', errorText(error));
    throw createError('Failed to load user credits.', 500);
  }

  if (!data) {
    return 0;
  }

  return data.credits ?? 0;
}

export async function getCredits(userId) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !userId) {
    return Infinity;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= CREDIT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await getCreditsOnce(supabase, userId);
    } catch (error) {
      if (error?.statusCode === 500 && !isTransientSupabaseError(error)) {
        throw error;
      }

      lastError = error;

      if (!isTransientSupabaseError(error) || attempt === CREDIT_RETRY_ATTEMPTS) {
        break;
      }

      const waitMs = CREDIT_RETRY_BASE_MS * attempt;
      console.warn(
        `[credits] transient getCredits failure (attempt ${attempt}/${CREDIT_RETRY_ATTEMPTS}), retry in ${waitMs}ms:`,
        errorText(error),
      );
      await sleep(waitMs);
    }
  }

  console.error('[credits] getCredits failed after retries:', errorText(lastError));
  throw createError('Failed to load user credits.', 500);
}

async function consumeCreditViaUpdate(supabase, userId, cost) {
  const currentCredits = await getCredits(userId);

  if (currentCredits < cost) {
    throw createError('Insufficient credits.', 402);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ credits: currentCredits - cost })
    .eq('id', userId)
    .eq('credits', currentCredits)
    .select('credits')
    .maybeSingle();

  if (error) {
    if (isTransientSupabaseError(error)) {
      throw error;
    }
    throw createError('Failed to update credits.', 500);
  }

  if (!data) {
    // Concurrent spend — retry once with a fresh read.
    const latest = await getCredits(userId);
    if (latest < cost) {
      throw createError('Insufficient credits.', 402);
    }

    const { data: retried, error: retryError } = await supabase
      .from('profiles')
      .update({ credits: latest - cost })
      .eq('id', userId)
      .eq('credits', latest)
      .select('credits')
      .maybeSingle();

    if (retryError) {
      if (isTransientSupabaseError(retryError)) {
        throw retryError;
      }
      throw createError('Failed to update credits.', 500);
    }

    if (!retried) {
      throw createError('Insufficient credits.', 402);
    }

    return retried.credits;
  }

  return data.credits;
}

async function consumeCreditOnce(supabase, userId, cost) {
  let data;
  let error;

  try {
    ({ data, error } = await supabase.rpc('consume_profile_credits', {
      p_user_id: userId,
      p_amount: cost,
    }));
  } catch (thrown) {
    if (isTransientSupabaseError(thrown)) {
      throw thrown;
    }
    console.error('[credits] consume_profile_credits threw:', errorText(thrown));
    return consumeCreditViaUpdate(supabase, userId, cost);
  }

  if (!error) {
    if (data === null || data === undefined) {
      throw createError('Insufficient credits.', 402);
    }

    return typeof data === 'number' ? data : Number(data);
  }

  if (isTransientSupabaseError(error)) {
    throw error;
  }

  // RPC missing / schema cache stale — fall back to optimistic update.
  if (isRpcMissingError(error)) {
    console.warn('[credits] consume_profile_credits unavailable, using update fallback');
    return consumeCreditViaUpdate(supabase, userId, cost);
  }

  console.warn('[credits] consume_profile_credits failed, trying update fallback:', errorText(error));
  return consumeCreditViaUpdate(supabase, userId, cost);
}

export async function consumeCredit(userId, amount = 1) {
  const supabase = getSupabaseAdmin();
  const cost = normalizeCreditCost(amount);

  if (!supabase || !userId) {
    return null;
  }

  let lastError = null;

  for (let attempt = 1; attempt <= CREDIT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await consumeCreditOnce(supabase, userId, cost);
    } catch (error) {
      if (error?.statusCode === 402) {
        throw error;
      }

      lastError = error;

      if (!isTransientSupabaseError(error) || attempt === CREDIT_RETRY_ATTEMPTS) {
        break;
      }

      const waitMs = CREDIT_RETRY_BASE_MS * attempt;
      console.warn(
        `[credits] transient charge failure (attempt ${attempt}/${CREDIT_RETRY_ATTEMPTS}), retry in ${waitMs}ms:`,
        errorText(error),
      );
      await sleep(waitMs);
    }
  }

  console.error('[credits] consume failed after retries:', errorText(lastError));
  throw createError('Failed to update credits.', 500);
}

export async function consumeCreditIfConfigured(userId, amount = 1) {
  if (!isCreditsEnabled() || !userId) {
    return null;
  }

  return consumeCredit(userId, amount);
}

async function attachCreditsRemaining(req, body) {
  if (req.user?.id) {
    try {
      body.creditsRemaining = await getCredits(req.user.id);
    } catch (error) {
      console.warn('[credits] could not read remaining credits:', errorText(error));
    }
    return;
  }

  if (isGuestCreditsEnabled() && req.guestKey) {
    const { getGuestCreditsRemaining } = await import('./guestCredits.js');
    body.creditsRemaining = await getGuestCreditsRemaining(req.guestKey);
  }
}

export async function finishGenerationResponse(res, req, body, statusCode = 200) {
  // OCR / extract-only (and any explicitly free paths) must not bill.
  if (req.skipCreditCharge) {
    body.creditsCharged = 0;
    await attachCreditsRemaining(req, body);
    return res.status(statusCode).json(body);
  }

  const creditCost = normalizeCreditCost(req.creditCost);
  body.creditsCharged = creditCost;

  if (req.user?.id) {
    let creditsRemaining = null;

    try {
      creditsRemaining = await consumeCreditIfConfigured(req.user.id, creditCost);
      if (creditsRemaining !== null) {
        body.creditsRemaining = creditsRemaining;
      }
    } catch (chargeError) {
      // Generation already succeeded — do not discard the result on a billing outage.
      if (chargeError?.statusCode === 402) {
        throw chargeError;
      }

      console.error(
        '[credits] post-generation charge failed; returning image anyway:',
        chargeError?.message || chargeError,
      );
      body.creditsCharged = 0;
      body.creditsChargeDeferred = true;
      await attachCreditsRemaining(req, body);
      creditsRemaining = typeof body.creditsRemaining === 'number' ? body.creditsRemaining : null;
    }

    // Persist generated images to the user's private cloud gallery.
    try {
      const { persistGenerationToUserGallery } = await import('./userGallery.js');
      await persistGenerationToUserGallery(req.user.id, body);
    } catch (error) {
      console.error('[gallery] persist after generation failed:', error?.message || error);
    }

    // Low-credit re-engagement email (once per stretch).
    if (typeof creditsRemaining === 'number' && creditsRemaining <= 1) {
      try {
        const { maybeSendLowCreditsEmail } = await import('./userEmailHooks.js');
        void maybeSendLowCreditsEmail(req.user.id, creditsRemaining);
      } catch (error) {
        console.warn('[credits] low-credit email skipped:', error?.message || error);
      }
    }
  } else if (isGuestCreditsEnabled() && req.guestKey) {
    const creditsRemaining = await consumeGuestCredit(
      req.guestKey,
      req.guestIp ?? null,
      creditCost,
    );

    if (creditsRemaining !== null) {
      body.creditsRemaining = creditsRemaining;
    }
  }

  return res.status(statusCode).json(body);
}
