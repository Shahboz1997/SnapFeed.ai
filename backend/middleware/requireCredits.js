import { creditCostForNumImages } from '../constants/generationCredits.js';
import { getCredits, isCreditsEnabled } from '../services/credits.js';
import {
  getGuestCreditsRemaining,
  isGuestCreditsEnabled,
  resolveGuestKey,
} from '../services/guestCredits.js';
import { getClientIp } from '../utils/clientIp.js';

function hasBearerToken(req) {
  const header = req.headers.authorization;
  return typeof header === 'string' && header.startsWith('Bearer ') && header.length > 7;
}

export async function requireCredits(req, res, next) {
  if (!isCreditsEnabled() && !isGuestCreditsEnabled()) {
    return next();
  }

  // OCR / text-extraction endpoints do not bill.
  if (req.body?.extractText === true) {
    req.creditCost = 0;
    req.skipCreditCharge = true;
    return next();
  }

  const creditCost = creditCostForNumImages(req.body?.numImages);
  req.creditCost = creditCost;

  try {
    // Token was sent but optionalAuth could not verify it — do not silently bill as guest
    // for truly invalid/expired sessions. Infra/DNS outages fall through to guest billing
    // so generation keeps working while Supabase is briefly unreachable.
    if (hasBearerToken(req) && !req.user?.id) {
      if (req.authError === 'unavailable') {
        console.warn(
          '[credits] auth verify unavailable (Supabase unreachable); falling through to guest path',
        );
      } else {
        return res.status(401).json({
          error: 'Invalid or expired token.',
          messageKey: 'api.authInvalid',
        });
      }
    }

    if (req.user?.id) {
      let credits;
      try {
        credits = await getCredits(req.user.id);
      } catch (creditsError) {
        // Supabase outage must not hard-block generation after retries in getCredits.
        // Charge still happens in finishGenerationResponse (or is deferred there).
        console.warn(
          '[credits] requireCredits skipping pre-check after load failure:',
          creditsError?.message || creditsError,
        );
        req.creditsCheckSkipped = true;
        return next();
      }

      if (credits < creditCost) {
        return res.status(402).json({
          error: 'Insufficient credits.',
          messageKey: 'api.insufficientCredits',
          credits,
          creditCost,
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

    if (credits < creditCost) {
      return res.status(402).json({
        error: 'Insufficient credits.',
        messageKey: 'api.insufficientCredits',
        credits,
        creditCost,
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
