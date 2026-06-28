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
