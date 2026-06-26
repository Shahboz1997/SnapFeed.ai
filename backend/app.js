import './env.js';
import express from 'express';
import cors from 'cors';
import imageRoutes from './routes/imageRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { errorHandler } from './utils/errors.js';

const app = express();
const PORT = process.env.PORT || 5000;

const productionOrigins = [
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
    return hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Настройка лимитов для приема тяжелых Base64 строк с фронтенда
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));

app.get('/api/health', (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '';
  res.json({
    status: 'ok',
    openaiConfigured: Boolean(apiKey),
    openaiKeyFormatValid: apiKey.startsWith('sk-') && apiKey.length > 20,
    replicateConfigured: Boolean(process.env.REPLICATE_API_TOKEN),
    bgRemovalBackend: process.env.PRODUCT_BG_REMOVAL_BACKEND || 'auto',
    imageUpscaleEnabled: process.env.IMAGE_UPSCALE_ENABLED !== 'false',
  });
});

app.get('/', (_req, res) => {
  res.json({
    message: 'SnapFeed.ai API',
    endpoints: [
      'GET /api/health',
      'POST /api/generate-image',
      'POST /api/generate-product-image',
      'POST /api/download-image',
      'POST /api/chat-assistant',
      'POST /api/chat/generate-prompt',
    ],
  });
});

app.use('/api', imageRoutes);
app.use('/api', chatRoutes);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Stop the other process or run: npx kill-port ${PORT}`);
    process.exit(1);
  }

  console.error('Failed to start server:', error.message);
  process.exit(1);
});
