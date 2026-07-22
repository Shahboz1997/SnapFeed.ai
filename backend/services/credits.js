import { normalizeCreditCost } from '../constants/generationCredits.js';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { createError } from '../utils/errors.js';
import { consumeGuestCredit, isGuestCreditsEnabled } from './guestCredits.js';

export function isCreditsEnabled() {
  return isSupabaseConfigured();
}

export async function getCredits(userId) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !userId) {
    return Infinity;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw createError('Failed to load user credits.', 500);
  }

  if (!data) {
    return 0;
  }

  return data.credits ?? 0;
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
      throw createError('Failed to update credits.', 500);
    }

    if (!retried) {
      throw createError('Insufficient credits.', 402);
    }

    return retried.credits;
  }

  return data.credits;
}

export async function consumeCredit(userId, amount = 1) {
  const supabase = getSupabaseAdmin();
  const cost = normalizeCreditCost(amount);

  if (!supabase || !userId) {
    return null;
  }

  // Prefer atomic RPC so concurrent generations cannot under-charge.
  const { data, error } = await supabase.rpc('consume_profile_credits', {
    p_user_id: userId,
    p_amount: cost,
  });

  if (!error) {
    if (data === null || data === undefined) {
      throw createError('Insufficient credits.', 402);
    }

    return typeof data === 'number' ? data : Number(data);
  }

  // RPC missing / schema cache stale — fall back to optimistic update.
  const message = typeof error.message === 'string' ? error.message : '';
  const rpcMissing = error.code === 'PGRST202'
    || error.code === '42883'
    || /consume_profile_credits/i.test(message);

  if (!rpcMissing) {
    console.error('[credits] consume_profile_credits failed:', error.message || error, error.code || '');
    throw createError('Failed to update credits.', 500);
  }

  console.warn('[credits] consume_profile_credits unavailable, using update fallback');
  return consumeCreditViaUpdate(supabase, userId, cost);
}

export async function consumeCreditIfConfigured(userId, amount = 1) {
  if (!isCreditsEnabled() || !userId) {
    return null;
  }

  return consumeCredit(userId, amount);
}

async function attachCreditsRemaining(req, body) {
  if (req.user?.id) {
    body.creditsRemaining = await getCredits(req.user.id);
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
    const creditsRemaining = await consumeCreditIfConfigured(req.user.id, creditCost);

    if (creditsRemaining !== null) {
      body.creditsRemaining = creditsRemaining;
    }

    // Persist generated images to the user's private cloud gallery.
    try {
      const { persistGenerationToUserGallery } = await import('./userGallery.js');
      await persistGenerationToUserGallery(req.user.id, body);
    } catch (error) {
      console.error('[gallery] persist after generation failed:', error?.message || error);
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
