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

export async function consumeCredit(userId) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !userId) {
    return null;
  }

  const currentCredits = await getCredits(userId);

  if (currentCredits <= 0) {
    throw createError('Insufficient credits.', 402);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ credits: currentCredits - 1 })
    .eq('id', userId)
    .eq('credits', currentCredits)
    .select('credits')
    .maybeSingle();

  if (error) {
    throw createError('Failed to update credits.', 500);
  }

  if (!data) {
    throw createError('Insufficient credits.', 402);
  }

  return data.credits;
}

export async function consumeCreditIfConfigured(userId) {
  if (!isCreditsEnabled() || !userId) {
    return null;
  }

  return consumeCredit(userId);
}

export async function finishGenerationResponse(res, req, body, statusCode = 200) {
  if (req.user?.id) {
    const creditsRemaining = await consumeCreditIfConfigured(req.user.id);

    if (creditsRemaining !== null) {
      body.creditsRemaining = creditsRemaining;
    }
  } else if (isGuestCreditsEnabled() && req.guestKey) {
    const creditsRemaining = await consumeGuestCredit(req.guestKey, req.guestIp ?? null);

    if (creditsRemaining !== null) {
      body.creditsRemaining = creditsRemaining;
    }
  }

  return res.status(statusCode).json(body);
}
