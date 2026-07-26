import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { createError } from '../utils/errors.js';

export const REFERRAL_BONUS_CREDITS = 2;

function normalizeCode(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16);
}

function randomCode() {
  return Math.random().toString(36).slice(2, 10);
}

async function ensureReferralCode(supabase, userId) {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, referral_code, credits')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Column may be missing until migration 015 is applied.
    if (/referral_code/i.test(error.message || '') || error.code === 'PGRST204' || error.code === '42703') {
      throw createError('Referrals are not set up yet.', 503, 'referral.notReady');
    }
    throw createError('Failed to load referral profile.', 500);
  }

  if (!profile) {
    throw createError('Profile not found.', 404);
  }

  if (profile.referral_code) {
    return profile;
  }

  const code = randomCode();
  const { data: updated, error: updateError } = await supabase
    .from('profiles')
    .update({ referral_code: code })
    .eq('id', userId)
    .is('referral_code', null)
    .select('id, referral_code, credits')
    .maybeSingle();

  if (updateError) {
    // Column may be missing until migration 015 is applied.
    if (/referral_code/i.test(updateError.message || '') || updateError.code === 'PGRST204') {
      throw createError('Referrals are not set up yet.', 503, 'referral.notReady');
    }
    throw createError('Failed to create referral code.', 500);
  }

  return updated || { ...profile, referral_code: code };
}

async function addCredits(supabase, userId, amount) {
  const { data: row, error } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .maybeSingle();

  if (error || !row) {
    throw createError('Failed to update credits.', 500);
  }

  const next = (row.credits ?? 0) + amount;
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ credits: next })
    .eq('id', userId)
    .eq('credits', row.credits);

  if (updateError) {
    throw createError('Failed to update credits.', 500);
  }

  return next;
}

export async function getReferralSummary(userId) {
  if (!isSupabaseConfigured() || !userId) {
    return null;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  try {
    const profile = await ensureReferralCode(supabase, userId);
    const { count } = await supabase
      .from('referral_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_id', userId);

    return {
      code: profile.referral_code,
      bonusCredits: REFERRAL_BONUS_CREDITS,
      invitedCount: typeof count === 'number' ? count : 0,
    };
  } catch (error) {
    if (error?.statusCode === 503) return null;
    throw error;
  }
}

/**
 * Apply referral code for a newly signed-in user.
 * Both sides get REFERRAL_BONUS_CREDITS once.
 */
export async function redeemReferralCode(refereeId, rawCode) {
  if (!isSupabaseConfigured() || !refereeId) {
    throw createError('Referrals unavailable.', 503);
  }

  const code = normalizeCode(rawCode);
  if (!code || code.length < 4) {
    throw createError('Invalid referral code.', 400, 'referral.invalidCode');
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw createError('Referrals unavailable.', 503);
  }

  const { data: existing } = await supabase
    .from('referral_redemptions')
    .select('id')
    .eq('referee_id', refereeId)
    .maybeSingle();

  if (existing) {
    throw createError('Referral already applied.', 409, 'referral.alreadyApplied');
  }

  const { data: referee, error: refereeReadError } = await supabase
    .from('profiles')
    .select('id, referred_by, credits')
    .eq('id', refereeId)
    .maybeSingle();

  if (refereeReadError) {
    if (/referred_by|referral/i.test(refereeReadError.message || '')) {
      throw createError('Referrals are not set up yet.', 503, 'referral.notReady');
    }
    throw createError('Failed to load profile.', 500);
  }

  if (!referee) {
    throw createError('Profile not found.', 404);
  }

  if (referee.referred_by) {
    throw createError('Referral already applied.', 409, 'referral.alreadyApplied');
  }

  const { data: referrer } = await supabase
    .from('profiles')
    .select('id, credits, referral_code')
    .eq('referral_code', code)
    .maybeSingle();

  if (!referrer) {
    throw createError('Referral code not found.', 404, 'referral.notFound');
  }

  if (referrer.id === refereeId) {
    throw createError('You cannot use your own referral code.', 400, 'referral.self');
  }

  const { error: insertError } = await supabase
    .from('referral_redemptions')
    .insert({
      referrer_id: referrer.id,
      referee_id: refereeId,
      credits_each: REFERRAL_BONUS_CREDITS,
    });

  if (insertError) {
    if (insertError.code === '23505') {
      throw createError('Referral already applied.', 409, 'referral.alreadyApplied');
    }
    if (
      insertError.code === '42P01'
      || insertError.code === 'PGRST205'
      || /referral_redemptions/i.test(insertError.message || '')
    ) {
      throw createError('Referrals are not set up yet.', 503, 'referral.notReady');
    }
    console.error('[referrals] insert failed:', insertError.message);
    throw createError('Failed to apply referral.', 500);
  }

  const bonus = REFERRAL_BONUS_CREDITS;
  await addCredits(supabase, referrer.id, bonus);
  const refereeCredits = await addCredits(supabase, refereeId, bonus);

  await supabase
    .from('profiles')
    .update({ referred_by: referrer.id })
    .eq('id', refereeId);

  return {
    bonusCredits: bonus,
    credits: refereeCredits,
  };
}
