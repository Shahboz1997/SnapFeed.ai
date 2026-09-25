import './env.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import imageRoutes from './routes/imageRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import authRoutes from './routes/authRoutes.js';
import billingRoutes, { lemonWebhookHandler } from './routes/billingRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import { isSupabaseConfigured } from './config/supabase.js';
import {
  getFashnCreditsBalance,
  getFashnModelName,
  isFashnConfigured,
} from './services/fashnTryOn.js';
import { protect } from './middleware/supabaseAuth.js';
import { apiRateLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './utils/errors.js';
import { isLemonSqueezyConfigured } from './services/lemonSqueezy.js';

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !isSupabaseConfigured()) {
  console.error(
    'FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in production. Refusing to start with open API / disabled credits.',
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Render / reverse proxies set X-Forwarded-For
app.set('trust proxy', 1);

const productionOrigins = [
  'https://snapfeed.help',
  'https://www.snapfeed.help',
  'https://snap-feed-ai.vercel.app',
  'https://snap-feed-nu.vercel.app',
  'https://snap-feed-ai-stratums-projects-053e839b.vercel.app',
  'https://snap-feed-ai-supportstratum-1005-stratums-projects-053e839b.vercel.app',
];

const allowedOrigins = [
  ...new Set([
    ...(process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    ...productionOrigins,
  ]),
];

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    return true;
  }

  try {
    const { hostname } = new URL(origin);
    // Exact product domains only — do not allow arbitrary *.vercel.app preview abuse.
    return hostname === 'snapfeed.help' || hostname.endsWith('.snapfeed.help');
  } catch {
    return false;
  }
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Guest-Fingerprint'],
}));

// Lemon webhooks need the raw body for HMAC verification (before JSON parser).
app.post(
  '/api/billing/webhook',
  express.raw({ type: '*/*' }),
  lemonWebhookHandler,
);

// Cap body size to reduce OOM under Ads concurrency (try-on = 1–2 images).
// Clients should compress / downscale before upload when possible.
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ limit: '12mb', extended: true }));

app.use('/api', apiRateLimiter);

app.get('/api/health', (_req, res) => {
  // Public probe only — do not leak stack/provider configuration to Ads scrapers.
  res.json({ status: 'ok' });
});

app.get('/api/health/detail', protect, (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '';
  res.json({
    status: 'ok',
    openaiConfigured: Boolean(apiKey),
    openaiKeyFormatValid: apiKey.startsWith('sk-') && apiKey.length > 20,
    replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
    fashnConfigured: isFashnConfigured(),
    fashnModel: isFashnConfigured() ? getFashnModelName() : null,
    supabaseConfigured: isSupabaseConfigured(),
    lemonConfigured: isLemonSqueezyConfigured(),
    bgRemovalBackend: process.env.PRODUCT_BG_REMOVAL_BACKEND || 'auto',
    imageUpscaleEnabled: process.env.IMAGE_UPSCALE_ENABLED !== 'false',
  });
});

app.get('/api/ready', (_req, res) => {
  const ready = isSupabaseConfigured()
    && Boolean(process.env.OPENAI_API_KEY || process.env.REPLICATE_API_TOKEN || isFashnConfigured());

  if (!ready) {
    return res.status(503).json({
      status: 'not_ready',
      supabaseConfigured: isSupabaseConfigured(),
      openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
      replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
      fashnConfigured: isFashnConfigured(),
    });
  }

  return res.json({ status: 'ready' });
});

app.get('/api/fashn/credits', protect, async (_req, res, next) => {
  try {
    if (isProduction && process.env.FASHN_CREDITS_ENDPOINT_ENABLED !== 'true') {
      return res.status(404).json({ error: 'Not found.' });
    }

    if (!isFashnConfigured()) {
      return res.status(503).json({ error: 'FASHN_API_KEY is not configured.' });
    }

    const credits = await getFashnCreditsBalance();
    return res.json({ success: true, credits });
  } catch (error) {
    return next(error);
  }
});

app.get('/', (_req, res) => {
  res.json({
    message: 'snapfeed.help API',
    endpoints: [
      'GET /api/health',
      'GET /api/ready',
      'POST /api/generate-image',
      'POST /api/generate-product-image',
      'POST /api/download-image',
      'POST /api/chat-assistant',
      'POST /api/chat/generate-prompt',
      'GET /api/auth/me',
      'POST /api/auth/claim-guest-credits',
      'POST /api/billing/checkout',
      'POST /api/billing/webhook',
      'GET /api/billing/status',
      'GET /api/auth/referral',
      'POST /api/auth/referral/redeem',
      'POST /api/auth/welcome-email',
      'GET /api/guest/credits',
      'PATCH /api/gallery/:id/collection',
    ],
  });
});

app.use('/api', authRoutes);
app.use('/api', billingRoutes);
app.use('/api', galleryRoutes);
app.use('/api', imageRoutes);
app.use('/api', chatRoutes);

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!isSupabaseConfigured()) {
    console.warn('WARNING: Supabase is not configured — auth and credits are disabled.');
  }
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or run: npx kill-port ${PORT}`);
    process.exit(1);
  }

  console.error('Failed to start server:', error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down…`);
  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
  // Under Ads load, a leaked rejection can leave corrupted state — restart cleanly in production.
  if (isProduction) {
    shutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  shutdown('uncaughtException');
});
