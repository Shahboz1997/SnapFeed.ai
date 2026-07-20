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
  formatTierAmountUsd,
  getPricingTier,
} from '../constants/pricingTiers.js';

const router = express.Router();

const DEFAULT_PAYMENT_DETAILS = [
  'СБП / карта: переведите точную сумму на реквизиты, которые пришлёт поддержка после заявки.',
  'В комментарии к платежу укажите email аккаунта SnapFeed.ai.',
  'После перевода нажмите «Я оплатил» — кредиты начислим в течение 10–15 минут после проверки.',
].join('\n');

function getManualPaymentDetails() {
  const fromEnv = process.env.MANUAL_PAYMENT_DETAILS?.trim();
  if (!fromEnv) return DEFAULT_PAYMENT_DETAILS;
  return fromEnv.replace(/\\n/g, '\n');
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

router.post('/auth/create-deposit-request', protect, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured() || !req.user?.id) {
      return res.status(503).json({
        error: 'Payments are not configured.',
        messageKey: 'api.authRequired',
      });
    }

    const planName = typeof req.body?.planName === 'string'
      ? req.body.planName.trim().toLowerCase()
      : '';
    const tier = getPricingTier(planName);

    if (!tier) {
      return res.status(400).json({
        error: 'Invalid plan name.',
        messageKey: 'pricing.invalidPlan',
      });
    }

    const amount = formatTierAmountUsd(tier);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('deposit_requests')
      .insert({
        user_id: req.user.id,
        plan_name: tier.id,
        amount,
        status: 'pending',
      })
      .select('id, plan_name, amount, status, created_at')
      .single();

    if (error) {
      console.error('[create-deposit-request]', error.message);
      return res.status(500).json({
        error: 'Failed to create deposit request.',
        messageKey: 'pricing.depositCreateFailed',
      });
    }

    return res.json({
      success: true,
      requestId: data.id,
      amount: Number(data.amount),
      credits: tier.credits,
      planName: tier.id,
      planLabel: tier.label,
      status: data.status,
      paymentDetails: getManualPaymentDetails(),
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
    const { data, error } = await supabase
      .from('deposit_requests')
      .select('id, plan_name, amount, status, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

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
        status: row.status,
        createdAt: row.created_at,
      })),
    });
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
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, avatar_url, credits, plan, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

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

export default router;
