import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getSupabaseAdmin, getSupabaseUrl, isSupabaseConfigured } from '../config/supabase.js';

let jwks = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`),
    );
  }

  return jwks;
}

function userFromJwtPayload(payload) {
  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    role: payload.role,
  };
}

const JWT_INVALID_CODES = new Set([
  'ERR_JWT_EXPIRED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWS_INVALID',
  'ERR_JWS_NOT_A_JWS',
]);

function isJwtInvalidError(error) {
  if (!error) return false;
  if (JWT_INVALID_CODES.has(error.code)) return true;
  const message = String(error.message || error || '');
  return /expired|invalid (?:jwt|token|signature)|signature verification|claim.*(validation|failed)|"alg"/i.test(message);
}

function isAuthInfraError(error) {
  if (!error) return false;
  if (isJwtInvalidError(error)) return false;

  const message = String(error.message || error || '');
  const causeCode = String(error.cause?.code || error.code || '');
  return (
    /fetch failed|network|timeout|abort|econnreset|enotfound|eai_again|und_err|jwks|socket/i.test(message)
    || /EAI_AGAIN|ENOTFOUND|ECONNRESET|ETIMEDOUT|UND_ERR|ABORT/i.test(causeCode)
  );
}

function isAuthApiInvalidError(error) {
  if (!error) return false;
  const message = String(error.message || error || '');
  const status = error.status || error.statusCode;
  return (
    status === 401
    || status === 403
    || /invalid (?:jwt|token)|expired|not authorized|user not found/i.test(message)
  );
}

export class AuthVerifyError extends Error {
  /**
   * @param {'invalid' | 'unavailable'} kind
   * @param {unknown} [cause]
   */
  constructor(kind, cause) {
    const causeMessage = cause?.message || String(cause || kind);
    super(causeMessage);
    this.name = 'AuthVerifyError';
    this.kind = kind;
    this.cause = cause;
  }
}

async function verifyAccessTokenWithJwks(token) {
  const options = {
    issuer: `${getSupabaseUrl()}/auth/v1`,
    audience: 'authenticated',
  };

  try {
    const { payload } = await jwtVerify(token, getJWKS(), options);
    return userFromJwtPayload(payload);
  } catch (firstError) {
    // Cold JWKS fetch / rotated keys — reset cache and retry once.
    jwks = null;
    try {
      const { payload } = await jwtVerify(token, getJWKS(), options);
      return userFromJwtPayload(payload);
    } catch (secondError) {
      throw secondError || firstError;
    }
  }
}

async function verifyAccessTokenWithAuthApi(token) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error('Supabase admin client unavailable');
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw error || new Error('Supabase getUser returned no user');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    role: data.user.role,
  };
}

async function verifyAccessToken(token) {
  try {
    return await verifyAccessTokenWithJwks(token);
  } catch (jwksError) {
    try {
      return await verifyAccessTokenWithAuthApi(token);
    } catch (apiError) {
      const jwksMsg = jwksError?.message || String(jwksError);
      const apiMsg = apiError?.message || String(apiError);
      console.warn('[supabaseAuth] token verify failed:', { jwks: jwksMsg, api: apiMsg });

      // Prefer Auth API when it reached Supabase (true expired/invalid vs DNS blip).
      if (isAuthApiInvalidError(apiError)) {
        throw new AuthVerifyError('invalid', apiError);
      }
      if (isJwtInvalidError(jwksError) && !isAuthInfraError(jwksError)) {
        throw new AuthVerifyError('invalid', jwksError);
      }
      if (isAuthInfraError(jwksError) || isAuthInfraError(apiError)) {
        throw new AuthVerifyError('unavailable', jwksError);
      }
      throw new AuthVerifyError('invalid', apiError || jwksError);
    }
  }
}

export async function optionalAuth(req, res, next) {
  if (!isSupabaseConfigured()) {
    return next();
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return next();
  }

  try {
    req.user = await verifyAccessToken(token);
    return next();
  } catch (error) {
    req.authError = error instanceof AuthVerifyError && error.kind === 'unavailable'
      ? 'unavailable'
      : 'invalid';
    return next();
  }
}

export async function protect(req, res, next) {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        error: 'Authentication is not configured.',
        messageKey: 'api.authUnavailable',
      });
    }

    return next();
  }

  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required.',
      messageKey: 'api.authRequired',
    });
  }

  try {
    req.user = await verifyAccessToken(token);
    return next();
  } catch (error) {
    if (error instanceof AuthVerifyError && error.kind === 'unavailable') {
      return res.status(503).json({
        error: 'Authentication is temporarily unavailable.',
        messageKey: 'api.authUnavailable',
      });
    }

    return res.status(401).json({
      error: 'Invalid or expired token.',
      messageKey: 'api.authInvalid',
    });
  }
}
