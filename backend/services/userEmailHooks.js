import { getSupabaseAdmin } from '../config/supabase.js';
import { isUserEmailConfigured, sendLowCreditsUserEmail } from './userEmail.js';

/** Send at most one low-credit email until the user tops up (flag cleared manually/on approve later). */
export async function maybeSendLowCreditsEmail(userId, creditsRemaining) {
  if (!isUserEmailConfigured() || !userId) return;

  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('email, full_name, low_credit_email_sent_at')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile?.email) return;
  if (profile.low_credit_email_sent_at) return;

  await sendLowCreditsUserEmail({
    email: profile.email,
    fullName: profile.full_name,
    credits: creditsRemaining,
  });

  await supabase
    .from('profiles')
    .update({ low_credit_email_sent_at: new Date().toISOString() })
    .eq('id', userId)
    .is('low_credit_email_sent_at', null);
}

/** Call after credits are topped up so the next low-balance nudge can fire again. */
export async function clearLowCreditEmailFlag(userId) {
  if (!userId) return;
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  await supabase
    .from('profiles')
    .update({ low_credit_email_sent_at: null })
    .eq('id', userId);
}
