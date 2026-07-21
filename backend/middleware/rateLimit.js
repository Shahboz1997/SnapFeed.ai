import rateLimit from 'express-rate-limit';

const isProduction = process.env.NODE_ENV === 'production';

function rateLimitHandler(_req, res) {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
    messageKey: 'api.rateLimited',
  });
}

/** Broad shield for all /api traffic. */
export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 300 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Costly generation endpoints (FASHN / Replicate / OpenAI). */
export const generateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 40 : 400,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/** Chat / prompt assistant (OpenAI, no credit gate today). */
export const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProduction ? 60 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});
