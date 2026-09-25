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
  getReferralSummary,
  redeemReferralCode,
} from '../services/referrals.js';
import {
  isUserEmailConfigured,
  sendWelcomeUserEmail,
} from '../services/userEmail.js';
import { getClientIp } from '../utils/clientIp.js';

const router = express.Router();

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

    const credits = await getGuestCreditsRemaining(guestKey, getClientIp(req));

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
