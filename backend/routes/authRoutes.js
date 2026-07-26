import express from 'express';
import { optionalAuth, protect } from '../middleware/supabaseAuth.js';
import { getCredits, isCreditsEnabled } from '../services/credits.js';
import {
  getGuestCreditsRemaining,
  isGuestCreditsEnabled,
  resolveGuestKey,
  transferGuestCreditsToUser,
} from '../services/guestCredits.js';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/supabase.js';
import {
  formatTierAmount,
  getPricingTier,
  normalizeDepositCurrency,
} from '../constants/pricingTiers.js';
import {
  isAdminEmailConfigured,
  sendDepositPaidAdminEmail,
} from '../services/adminNotifyEmail.js';
import {
  getReferralSummary,
  redeemReferralCode,
} from '../services/referrals.js';
import {
  isUserEmailConfigured,
  sendWelcomeUserEmail,
} from '../services/userEmail.js';

const router = express.Router();

const DEFAULT_PAYMENT_DETAILS_RUB = [
  'СБП / карта / крипта: переведите точную сумму на реквизиты ниже (или которые пришлёт поддержка).',
  'В комментарии к платежу укажите email аккаунта SnapFeed.ai.',
  'После перевода нажмите «Я оплатил» — кредиты начислим в течение 10–15 минут после проверки.',
].join('\n');

const DEFAULT_PAYMENT_DETAILS_USD = [
  'Card / crypto / PayPal: transfer the exact USD amount using the details below (or wait for support to reply).',
  'Include your SnapFeed.ai account email in the payment note.',
  'After paying, tap “I paid” — credits are added within 10–15 minutes after verification.',
].join('\n');

const DEFAULT_PAYMENT_DETAILS_UZS = [
  'Karta / kripto: aniq soʻm summasini quyidagi rekvizitlarga o\'tkazing (yoki support javobini kuting).',
  'To\'lov izohiga SnapFeed.ai emailingizni yozing.',
  'To\'lovdan so\'ng «To\'ladim» tugmasini bosing — kreditlar 10–15 daqiqada qo\'shiladi.',
].join('\n');

const DEFAULT_PAYMENT_DETAILS_TJS = [
  'Корт / крипто: маблағи дақиқи сомониро ба реквизитҳои зерин гузаронед (ё ҷавоби дастгириро интизор шавед).',
  'Дар шарҳи пардохт email-и ҳисоби SnapFeed.ai-ро нависед.',
  'Пас аз пардохт «Ман пардохт кардам»-ро пахш кунед — кредитҳо дар 10–15 дақиқа илова мешаванд.',
].join('\n');

function getManualPaymentDetails(currency = 'RUB') {
  const code = normalizeDepositCurrency(currency);
  const envKey = {
    RUB: 'MANUAL_PAYMENT_DETAILS',
    USD: 'MANUAL_PAYMENT_DETAILS_USD',
    UZS: 'MANUAL_PAYMENT_DETAILS_UZS',
    TJS: 'MANUAL_PAYMENT_DETAILS_TJS',
  }[code];
  const fromEnv = process.env[envKey]?.trim() || process.env.MANUAL_PAYMENT_DETAILS?.trim();
  if (fromEnv) return fromEnv.replace(/\\n/g, '\n');
  if (code === 'USD') return DEFAULT_PAYMENT_DETAILS_USD;
  if (code === 'UZS') return DEFAULT_PAYMENT_DETAILS_UZS;
  if (code === 'TJS') return DEFAULT_PAYMENT_DETAILS_TJS;
  return DEFAULT_PAYMENT_DETAILS_RUB;
}

router.get('/guest/credits', optionalAuth, async (req, res, next) => {
  try {
    if (req.user?.id) {
      const credits = isCreditsEnabled()
        ? await getCredits(req.user.id)
        : null;

      return res.json({
        credits,
        isGuest: false,
      });
    }

    if (!isGuestCreditsEnabled()) {
      return res.json({
        credits: null,
        isGuest: true,
      });
    }

    const guestKey = resolveGuestKey(req);

    if (!guestKey) {
      return res.status(400).json({
        error: 'Guest fingerprint is required.',
        messageKey: 'api.fingerprintRequired',
      });
    }

    const credits = await getGuestCreditsRemaining(guestKey);

    return res.json({
      credits,
      isGuest: true,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/claim-guest-credits', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.json({ transferred: 0, credits: null });
    }

    const guestKey = resolveGuestKey(req);

    if (!guestKey) {
      const credits = isCreditsEnabled() ? await getCredits(req.user.id) : null;
      return res.json({ transferred: 0, credits });
    }

    const result = await transferGuestCreditsToUser(req.user.id, guestKey);
    return res.json(result);
  } catch (error) {
    return next(error);
  }
});

/** Preview invoice (payment details) without creating a deposit_requests row. */
router.post('/auth/preview-deposit', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.status(503).json({
        error: 'Payments are not configured.',
        messageKey: 'api.authUnavailable',
      });
    }

    const planName = typeof req.body?.planName === 'string'
      ? req.body.planName.trim().toLowerCase()
      : '';
    const currency = normalizeDepositCurrency(req.body?.currency);
    const tier = getPricingTier(planName);

    if (!tier) {
      return res.status(400).json({
        error: 'Invalid plan name.',
        messageKey: 'pricing.invalidPlan',
      });
    }

    const amount = formatTierAmount(tier, currency);

    return res.json({
      success: true,
      requestId: null,
      amount,
      currency,
      credits: tier.credits,
      planName: tier.id,
      planLabel: tier.label,
      status: null,
      paymentDetails: getManualPaymentDetails(currency),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/create-deposit-request', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.status(503).json({
        error: 'Payments are not configured.',
        messageKey: 'api.authUnavailable',
      });
    }

    const planName = typeof req.body?.planName === 'string'
      ? req.body.planName.trim().toLowerCase()
      : '';
    const currency = normalizeDepositCurrency(req.body?.currency);
    const tier = getPricingTier(planName);

    if (!tier) {
      return res.status(400).json({
        error: 'Invalid plan name.',
        messageKey: 'pricing.invalidPlan',
      });
    }

    const amount = formatTierAmount(tier, currency);
    const supabase = getSupabaseAdmin();

    let { data, error } = await supabase
      .from('deposit_requests')
      .insert({
        user_id: req.user.id,
        plan_name: tier.id,
        amount,
        currency,
        status: 'pending',
      })
      .select('id, plan_name, amount, currency, status, created_at')
      .single();

    // Older schema without currency column — retry without it.
    if (error && /currency/i.test(error.message || '')) {
      console.warn('[create-deposit-request] currency column missing — retrying without it');
      ({ data, error } = await supabase
        .from('deposit_requests')
        .insert({
          user_id: req.user.id,
          plan_name: tier.id,
          amount,
          status: 'pending',
        })
        .select('id, plan_name, amount, status, created_at')
        .single());
    }

    if (error) {
      console.error('[create-deposit-request]', error.message);
      const tableMissing = error.code === '42P01'
        || error.code === 'PGRST205'
        || /Could not find the table/i.test(error.message || '')
        || (/deposit_requests/i.test(error.message || '') && !/currency/i.test(error.message || ''));
      return res.status(tableMissing ? 503 : 500).json({
        error: tableMissing
          ? 'Deposit table is not set up. Run supabase/migrations/006_deposit_requests.sql in Supabase.'
          : 'Failed to create deposit request.',
        messageKey: 'pricing.depositCreateFailed',
      });
    }

    return res.json({
      success: true,
      requestId: data.id,
      amount: Number(data.amount),
      currency: normalizeDepositCurrency(data.currency || currency),
      credits: tier.credits,
      planName: tier.id,
      planLabel: tier.label,
      status: data.status,
      paymentDetails: getManualPaymentDetails(currency),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/deposit-requests', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.json({ requests: [] });
    }

    const supabase = getSupabaseAdmin();
    let { data, error } = await supabase
      .from('deposit_requests')
      .select('id, plan_name, amount, currency, status, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    // Older schema without currency column — retry without it.
    if (error && /currency/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('deposit_requests')
        .select('id, plan_name, amount, status, created_at')
        .eq('user_id', req.user.id)
        .order('created_at', { ascending: false })
        .limit(50));
    }

    // Table not created yet — show empty history instead of a hard error.
    if (error && (
      error.code === '42P01'
      || error.code === 'PGRST205'
      || /deposit_requests/i.test(error.message || '')
      || /Could not find the table/i.test(error.message || '')
    )) {
      console.warn('[deposit-requests] table missing — run supabase/migrations/006_deposit_requests.sql');
      return res.json({ requests: [] });
    }

    if (error) {
      console.error('[deposit-requests]', error.message);
      return res.status(500).json({
        error: 'Failed to load deposit requests.',
        messageKey: 'pricing.depositLoadFailed',
      });
    }

    return res.json({
      requests: (data ?? []).map((row) => ({
        id: row.id,
        planName: row.plan_name,
        amount: Number(row.amount),
        currency: normalizeDepositCurrency(row.currency),
        status: row.status,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/notify-deposit-paid', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.status(503).json({
        error: 'Payments are not configured.',
        messageKey: 'api.authUnavailable',
      });
    }

    if (!isAdminEmailConfigured()) {
      return res.status(503).json({
        error: 'Admin email is not configured. Set SMTP_* or RESEND_API_KEY.',
        messageKey: 'pricing.paidNotifyNotConfigured',
      });
    }

    const requestId = typeof req.body?.requestId === 'string'
      ? req.body.requestId.trim()
      : '';

    if (!requestId) {
      return res.status(400).json({
        error: 'requestId is required.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    const supabase = getSupabaseAdmin();
    let { data: row, error } = await supabase
      .from('deposit_requests')
      .select('id, plan_name, amount, currency, status, user_id')
      .eq('id', requestId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error && /currency/i.test(error.message || '')) {
      ({ data: row, error } = await supabase
        .from('deposit_requests')
        .select('id, plan_name, amount, status, user_id')
        .eq('id', requestId)
        .eq('user_id', req.user.id)
        .maybeSingle());
    }

    if (error) {
      console.error('[notify-deposit-paid]', error.message);
      return res.status(500).json({
        error: 'Failed to load deposit request.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    if (!row) {
      return res.status(404).json({
        error: 'Deposit request not found.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    if (row.status !== 'pending') {
      return res.status(400).json({
        error: 'Deposit request is no longer pending.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    const currency = normalizeDepositCurrency(row.currency);
    const tier = getPricingTier(row.plan_name);
    if (!tier) {
      return res.status(400).json({
        error: 'Invalid plan on deposit request.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    try {
      await sendDepositPaidAdminEmail({
        requestId: row.id,
        userEmail: req.user.email ?? null,
        userId: req.user.id,
        planName: tier.id,
        planLabel: tier.label,
        amount: Number(row.amount),
        currency,
        credits: tier.credits,
      });
    } catch (mailError) {
      console.error('[notify-deposit-paid] email failed:', mailError.message);
      return res.status(502).json({
        error: 'Failed to send admin notification email.',
        messageKey: 'pricing.paidNotifyFailed',
      });
    }

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/me', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.json({
        authEnabled: false,
        user: null,
        profile: null,
      });
    }

    const supabase = getSupabaseAdmin();
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, credits, plan, created_at, referral_code')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error && (/referral_code/i.test(error.message || '') || error.code === 'PGRST204')) {
      ({ data: profile, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, avatar_url, credits, plan, created_at')
        .eq('id', req.user.id)
        .maybeSingle());
    }

    if (error) {
      return res.status(500).json({ error: 'Failed to load profile.' });
    }

    const credits = isCreditsEnabled()
      ? (profile?.credits ?? await getCredits(req.user.id))
      : null;

    return res.json({
      authEnabled: true,
      user: {
        id: req.user.id,
        email: req.user.email ?? profile?.email ?? null,
      },
      profile: profile
        ? { ...profile, credits }
        : {
            id: req.user.id,
            email: req.user.email,
            full_name: null,
            avatar_url: null,
            credits: credits ?? 0,
            plan: 'free',
          },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/auth/referral', protect, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.', messageKey: 'api.authRequired' });
    }

    const summary = await getReferralSummary(req.user.id);
    if (!summary) {
      return res.status(503).json({
        error: 'Referrals are not set up yet.',
        messageKey: 'referral.notReady',
      });
    }

    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/referral/redeem', protect, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.', messageKey: 'api.authRequired' });
    }

    const code = typeof req.body?.code === 'string' ? req.body.code : '';
    const result = await redeemReferralCode(req.user.id, code);
    return res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/auth/welcome-email', protect, async (req, res, next) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required.', messageKey: 'api.authRequired' });
    }

    if (!isUserEmailConfigured()) {
      return res.json({ sent: false, reason: 'not_configured' });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.json({ sent: false, reason: 'unavailable' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, credits, welcome_email_sent_at')
      .eq('id', req.user.id)
      .maybeSingle();

    if (!profile?.email) {
      return res.json({ sent: false, reason: 'no_email' });
    }

    if (profile.welcome_email_sent_at) {
      return res.json({ sent: false, reason: 'already_sent' });
    }

    await sendWelcomeUserEmail({
      email: profile.email,
      fullName: profile.full_name,
      credits: profile.credits ?? 3,
    });

    await supabase
      .from('profiles')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', req.user.id)
      .is('welcome_email_sent_at', null);

    return res.json({ sent: true });
  } catch (error) {
    console.warn('[welcome-email]', error?.message || error);
    return res.json({ sent: false, reason: 'failed' });
  }
});

export default router;
