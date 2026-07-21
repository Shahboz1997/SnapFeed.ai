import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getSupabaseUrl, isSupabaseConfigured } from '../config/supabase.js';

let jwks = null;

function getJWKS() {
  if (!jwks) {
    jwks = createRemoteJWKSet(
      new URL(`${getSupabaseUrl()}/auth/v1/.well-known/jwks.json`),
    );
  }

  return jwks;
}

async function verifyAccessToken(token) {
  const options = {
    issuer: `${getSupabaseUrl()}/auth/v1`,
  };

  try {
    const { payload } = await jwtVerify(token, getJWKS(), options);
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: payload.role,
    };
  } catch (error) {
    // Cold JWKS fetch / transient network — reset cache and retry once.
    jwks = null;
    const { payload } = await jwtVerify(token, getJWKS(), options);
    return {
      id: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      role: payload.role,
    };
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
  } catch {
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
  } catch {
    return res.status(401).json({
      error: 'Invalid or expired token.',
      messageKey: 'api.authInvalid',
    });
  }
}
