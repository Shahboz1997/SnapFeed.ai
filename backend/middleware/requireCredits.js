import { getCredits, isCreditsEnabled } from '../services/credits.js';
import {
  getGuestCreditsRemaining,
  isGuestCreditsEnabled,
  resolveGuestKey,
} from '../services/guestCredits.js';
import { getClientIp } from '../utils/clientIp.js';

export async function requireCredits(req, res, next) {
  if (!isCreditsEnabled() && !isGuestCreditsEnabled()) {
    return next();
  }

  try {
    if (req.user?.id) {
      const credits = await getCredits(req.user.id);

      if (credits <= 0) {
        return res.status(402).json({
          error: 'Insufficient credits.',
          messageKey: 'api.insufficientCredits',
          credits,
        });
      }

      req.creditsBefore = credits;
      return next();
    }

    if (!isGuestCreditsEnabled()) {
      return next();
    }

    const guestKey = resolveGuestKey(req);

    if (!guestKey) {
      return res.status(400).json({
        error: 'Guest fingerprint is required.',
        messageKey: 'api.fingerprintRequired',
      });
    }

    const credits = await getGuestCreditsRemaining(guestKey);

    if (credits <= 0) {
      return res.status(402).json({
        error: 'Insufficient credits.',
        messageKey: 'api.insufficientCredits',
        credits: 0,
      });
    }

    req.guestKey = guestKey;
    req.guestIp = getClientIp(req);
    req.guestCreditsBefore = credits;
    return next();
  } catch (error) {
    return next(error);
  }
}
