import './env.js';
import express from 'express';
import cors from 'cors';
import imageRoutes from './routes/imageRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import { errorHandler } from './utils/errors.js';

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Настройка лимитов для приема тяжелых Base64 строк с фронтенда
app.use(express.json({ limit: '7mb' }));
app.use(express.urlencoded({ limit: '7mb', extended: true }));

app.get('/api/health', (_req, res) => {
  const apiKey = process.env.OPENAI_API_KEY || '';
  res.json({
    status: 'ok',
    openaiConfigured: Boolean(apiKey),
    openaiKeyFormatValid: apiKey.startsWith('sk-') && apiKey.length > 20,
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
});
