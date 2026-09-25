import express from 'express';
import {
  generatePostImage,
  downloadImage,
  serveGeneratedImage,
} from '../controllers/imageController.js';
import { generateProductImage } from '../controllers/productImageController.js';
import { optionalAuth } from '../middleware/supabaseAuth.js';
import { requireCredits } from '../middleware/requireCredits.js';
import { generateRateLimiter } from '../middleware/rateLimit.js';
import { acquireGenerationLock } from '../middleware/generationLock.js';
import { generationTimeoutGuard } from '../middleware/generationTimeout.js';

const router = express.Router();

// optionalAuth before rate limit so keys use user id / fingerprint (not only IP).
const generateGuards = [
  optionalAuth,
  generateRateLimiter,
  requireCredits,
  acquireGenerationLock,
  generationTimeoutGuard,
];

router.post('/generate-image', ...generateGuards, generatePostImage);
router.post('/generate-product-image', ...generateGuards, generateProductImage);
router.post('/download-image', downloadImage);
router.get('/generated-images/:filename', serveGeneratedImage);

export default router;
