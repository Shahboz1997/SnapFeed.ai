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

function consumeMemoryGuestCredit(guestKey, amount = 1) {
  const cost = Math.max(1, Math.floor(Number(amount) || 1));
  const used = memoryGuestUsage.get(guestKey) ?? 0;
  const remaining = GUEST_MAX_GENERATIONS - used;

  if (remaining < cost) {
    throw createError('Insufficient credits.', 402);
  }

  memoryGuestUsage.set(guestKey, used + cost);
  return GUEST_MAX_GENERATIONS - used - cost;
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
    if (isGuestUsageSchemaError(error) || isGuestUsageTableMissing(error)) {
      logGuestTableMissingOnce();
      return getMemoryGuestCreditsRemaining(guestKey);
    }
    console.error('[guestCredits] getGuestCreditsRemaining failed:', error.message || error, error.code || '');
    logGuestTableMissingOnce();
    return getMemoryGuestCreditsRemaining(guestKey);
  }

  const used = data?.generations_used ?? 0;
  const max = data?.max_generations ?? GUEST_MAX_GENERATIONS;
  return Math.max(0, max - used);
}

export async function consumeGuestCredit(guestKey, ipAddress = null, amount = 1) {
  const supabase = getSupabaseAdmin();
  const cost = Math.max(1, Math.floor(Number(amount) || 1));

  if (!supabase || !guestKey) {
    return null;
  }

  const remainingBefore = await getGuestCreditsRemaining(guestKey);

  if (remainingBefore < cost) {
    throw createError('Insufficient credits.', 402);
  }

  const { data: existing, error: readError } = await supabase
    .from('guest_usage')
    .select('generations_used, max_generations')
    .eq('fingerprint_hash', guestKey)
    .maybeSingle();

  if (readError) {
    // Network / schema / missing-table: keep try-on working with in-memory guest credits.
    console.warn(
      '[guestCredits] consumeGuestCredit read failed, using memory fallback:',
      readError.message || readError,
    );
    logGuestTableMissingOnce();
    return consumeMemoryGuestCredit(guestKey, cost);
  }

  const now = new Date().toISOString();

  if (!existing) {
    const { data, error } = await supabase
      .from('guest_usage')
      .insert({
        fingerprint_hash: guestKey,
        ip_address: ipAddress,
        generations_used: cost,
        max_generations: GUEST_MAX_GENERATIONS,
        last_seen_at: now,
      })
      .select('generations_used, max_generations')
      .single();

    if (error) {
      if (error.code === '23505') {
        return consumeGuestCredit(guestKey, ipAddress, cost);
      }
      console.warn(
        '[guestCredits] consumeGuestCredit insert failed, using memory fallback:',
        error.message || error,
      );
      logGuestTableMissingOnce();
      return consumeMemoryGuestCredit(guestKey, cost);
    }

    return Math.max(0, data.max_generations - data.generations_used);
  }

  if (existing.generations_used + cost > existing.max_generations) {
    throw createError('Insufficient credits.', 402);
  }

  const { data, error } = await supabase
    .from('guest_usage')
    .update({
      generations_used: existing.generations_used + cost,
      ip_address: ipAddress,
      last_seen_at: now,
    })
    .eq('fingerprint_hash', guestKey)
    .eq('generations_used', existing.generations_used)
    .select('generations_used, max_generations')
    .maybeSingle();

  if (error) {
    console.warn(
      '[guestCredits] consumeGuestCredit update failed, using memory fallback:',
      error.message || error,
    );
    logGuestTableMissingOnce();
    return consumeMemoryGuestCredit(guestKey, cost);
  }

  if (!data) {
    return consumeGuestCredit(guestKey, ipAddress, cost);
  }

  const totalAllowance = data.max_generations;
  return Math.max(0, totalAllowance - data.generations_used);
}

function isMissingColumnError(error, column) {
  const message = error?.message || '';
  return new RegExp(column, 'i').test(message)
    && /column|schema cache/i.test(message);
}

export async function transferGuestCreditsToUser(userId, guestKey) {
  const supabase = getSupabaseAdmin();

  if (!supabase || !userId || !guestKey) {
    return { transferred: 0, credits: null };
  }

  let claimColumnAvailable = true;
  let { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits, guest_fingerprint_claimed')
    .eq('id', userId)
    .maybeSingle();

  // Older profiles schema without guest_fingerprint_claimed.
  if (profileError && isMissingColumnError(profileError, 'guest_fingerprint_claimed')) {
    claimColumnAvailable = false;
    console.warn('[guest-credits] guest_fingerprint_claimed missing — transfer without claim lock');
    ({ data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .maybeSingle());
  }

  if (profileError) {
    console.error('[guest-credits] load profile failed:', profileError.message);
    throw createError('Failed to load profile.', 500);
  }

  if (claimColumnAvailable && profile?.guest_fingerprint_claimed) {
    return { transferred: 0, credits: profile.credits ?? 0 };
  }

  const remaining = await getGuestCreditsRemaining(guestKey);

  if (remaining <= 0) {
    if (claimColumnAvailable) {
      await supabase
        .from('profiles')
        .update({ guest_fingerprint_claimed: guestKey })
        .eq('id', userId)
        .is('guest_fingerprint_claimed', null);
    }

    return { transferred: 0, credits: profile?.credits ?? 0 };
  }

  // Welcome credit is already granted on signup — do not stack guest remainder on top.
  const currentCredits = profile?.credits ?? 0;
  const newCredits = Math.max(currentCredits, remaining);
  const transferred = Math.max(0, newCredits - currentCredits);
  const updatePayload = claimColumnAvailable
    ? { credits: newCredits, guest_fingerprint_claimed: guestKey }
    : { credits: newCredits };

  let updateQuery = supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', userId);

  if (claimColumnAvailable) {
    updateQuery = updateQuery.is('guest_fingerprint_claimed', null);
  }

  const { data: updatedProfile, error: updateError } = await updateQuery
    .select('credits')
    .maybeSingle();

  if (updateError) {
    console.error('[guest-credits] transfer failed:', updateError.message);
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

  return { transferred, credits: updatedProfile.credits };
}
