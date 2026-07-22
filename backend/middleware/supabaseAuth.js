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

async function verifyAccessTokenWithJwks(token) {
  const options = {
    issuer: `${getSupabaseUrl()}/auth/v1`,
    audience: 'authenticated',
  };

  try {
    const { payload } = await jwtVerify(token, getJWKS(), options);
    return userFromJwtPayload(payload);
  } catch {
    // Cold JWKS fetch / rotated keys — reset cache and retry once.
    jwks = null;
    const { payload } = await jwtVerify(token, getJWKS(), options);
    return userFromJwtPayload(payload);
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
      throw jwksError;
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
