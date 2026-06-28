import crypto from 'crypto';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import { createError } from '../utils/errors.js';
import { getClientIp } from '../utils/clientIp.js';

export const GUEST_MAX_GENERATIONS = Number.parseInt(
  process.env.GUEST_MAX_GENERATIONS || '3',
  10,
) || 3;

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i;

/** Fallback when migration 002_guest_usage.sql has not been applied yet. */
const memoryGuestUsage = new Map();
let guestTableMissingLogged = false;

function isGuestUsageTableMissing(error) {
  if (!error) return false;

  const message = typeof error.message === 'string' ? error.message : '';
  const details = typeof error.details === 'string' ? error.details : '';

  return (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || message.includes('guest_usage')
    || details.includes('guest_usage')
    || message.includes('Could not find the table')
  );
}

function isGuestUsageSchemaError(error) {
  if (!error) return false;
  if (isGuestUsageTableMissing(error)) return true;

  const message = typeof error.message === 'string' ? error.message : '';
  return (
    error.code === 'PGRST204'
    || error.code === '42703'
    || message.includes('purchased_credits')
    || message.includes('guest_usage')
  );
}

function logGuestTableMissingOnce() {
  if (guestTableMissingLogged) return;
  guestTableMissingLogged = true;
  console.warn(
    '[guestCredits] Table public.guest_usage is missing. '
    + 'Run supabase/migrations/002_guest_usage.sql in Supabase SQL Editor. '
    + 'Using in-memory guest limits until then.',
  );
}

function getMemoryGuestCreditsRemaining(guestKey) {
  const used = memoryGuestUsage.get(guestKey) ?? 0;
  return Math.max(0, GUEST_MAX_GENERATIONS - used);
}

function consumeMemoryGuestCredit(guestKey) {
  const used = memoryGuestUsage.get(guestKey) ?? 0;

  if (used >= GUEST_MAX_GENERATIONS) {
    throw createError('Insufficient credits.', 402);
  }

  memoryGuestUsage.set(guestKey, used + 1);
  return GUEST_MAX_GENERATIONS - used - 1;
}

export function resolveGuestKey(req) {
  const headerValue = req.headers['x-guest-fingerprint'];
  const fingerprint = typeof headerValue === 'string' ? headerValue.trim() : '';

  if (fingerprint && FINGERPRINT_PATTERN.test(fingerprint)) {
    return fingerprint.toLowerCase();
  }

  const ip = getClientIp(req);
  if (ip) {
    return crypto.createHash('sha256').update(`ip:${ip}`).digest('hex');
  }

  return null;
}

export function isGuestCreditsEnabled() {
  return isSupabaseConfigured();
}

export async function getGuestCreditsRemaining(guestKey) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !guestKey) {
    return GUEST_MAX_GENERATIONS;
  }

  const { data, error } = await supabase
    .from('guest_usage')
    .select('generations_used, max_generations')
    .eq('fingerprint_hash', guestKey)
    .maybeSingle();

  if (error) {
    if (isGuestUsageSchemaError(error)) {
      logGuestTableMissingOnce();
      return getMemoryGuestCreditsRemaining(guestKey);
    }
    console.error('[guestCredits] getGuestCreditsRemaining failed:', error.message || error);
    throw createError('Failed to check guest credits.', 500);
  }

  const used = data?.generations_used ?? 0;
  const max = data?.max_generations ?? GUEST_MAX_GENERATIONS;
  return Math.max(0, max - used);
}

export async function consumeGuestCredit(guestKey, ipAddress = null) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !guestKey) {
    return null;
  }

  const remainingBefore = await getGuestCreditsRemaining(guestKey);

  if (remainingBefore <= 0) {
    throw createError('Insufficient credits.', 402);
  }

  const { data: existing, error: readError } = await supabase
    .from('guest_usage')
    .select('generations_used, max_generations')
    .eq('fingerprint_hash', guestKey)
    .maybeSingle();

  if (readError) {
    if (isGuestUsageSchemaError(readError)) {
      logGuestTableMissingOnce();
      return consumeMemoryGuestCredit(guestKey);
    }
    throw createError('Failed to load guest usage.', 500);
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabase
      .from('guest_usage')
      .insert({
        fingerprint_hash: guestKey,
        ip_address: ipAddress,
        generations_used: 1,
        max_generations: GUEST_MAX_GENERATIONS,
        last_seen_at: now,
      })
      .select('generations_used, max_generations')
      .single();

    if (error) {
      if (error.code === '23505') {
        return consumeGuestCredit(guestKey, ipAddress);
      }
      if (isGuestUsageSchemaError(error)) {
        logGuestTableMissingOnce();
        return consumeMemoryGuestCredit(guestKey);
      }
      throw createError('Failed to update guest credits.', 500);
    }

    return Math.max(0, data.max_generations - data.generations_used);
  }

  if (existing.generations_used >= existing.max_generations) {
    throw createError('Insufficient credits.', 402);
  }

  const { data, error } = await supabase
    .from('guest_usage')
    .update({
      generations_used: existing.generations_used + 1,
      ip_address: ipAddress,
      last_seen_at: now,
    })
    .eq('fingerprint_hash', guestKey)
    .eq('generations_used', existing.generations_used)
    .select('generations_used, max_generations')
    .maybeSingle();

  if (error) {
    if (isGuestUsageTableMissing(error)) {
      logGuestTableMissingOnce();
      return consumeMemoryGuestCredit(guestKey);
    }
    throw createError('Failed to update guest credits.', 500);
  }

  if (!data) {
    return consumeGuestCredit(guestKey, ipAddress);
  }

  const totalAllowance = data.max_generations;
  return Math.max(0, totalAllowance - data.generations_used);
}

export async function transferGuestCreditsToUser(userId, guestKey) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !userId || !guestKey) {
    return { transferred: 0, credits: null };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, guest_fingerprint_claimed')
    .eq('id', userId)
    .maybeSingle();

  if (profileError) {
    throw createError('Failed to load profile.', 500);
  }

  if (profile?.guest_fingerprint_claimed) {
    return { transferred: 0, credits: profile.credits ?? 0 };
  }

  const remaining = await getGuestCreditsRemaining(guestKey);

  if (remaining <= 0) {
    await supabase
      .from('profiles')
      .update({ guest_fingerprint_claimed: guestKey })
      .eq('id', userId)
      .is('guest_fingerprint_claimed', null);

    return { transferred: 0, credits: profile?.credits ?? 0 };
  }

  const newCredits = (profile?.credits ?? 0) + remaining;

  const { data: updatedProfile, error: updateError } = await supabase
    .from('profiles')
    .update({
      credits: newCredits,
      guest_fingerprint_claimed: guestKey,
    })
    .eq('id', userId)
    .is('guest_fingerprint_claimed', null)
    .select('credits')
    .maybeSingle();

  if (updateError) {
    throw createError('Failed to transfer guest credits.', 500);
  }

  if (!updatedProfile) {
    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .maybeSingle();

    return { transferred: 0, credits: currentProfile?.credits ?? profile?.credits ?? 0 };
  }

  const { data: guestRow } = await supabase
    .from('guest_usage')
    .select('generations_used, max_generations')
    .eq('fingerprint_hash', guestKey)
    .maybeSingle();

  if (guestRow) {
    const totalAllowance = guestRow.max_generations;
    await supabase
      .from('guest_usage')
      .update({ generations_used: totalAllowance, last_seen_at: new Date().toISOString() })
      .eq('fingerprint_hash', guestKey);
  }

  return { transferred: remaining, credits: updatedProfile.credits };
}
