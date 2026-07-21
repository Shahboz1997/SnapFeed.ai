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

const router = express.Router();

router.post('/generate-image', generateRateLimiter, optionalAuth, requireCredits, generatePostImage);
router.post('/generate-product-image', generateRateLimiter, optionalAuth, requireCredits, generateProductImage);
router.post('/download-image', downloadImage);
router.get('/generated-images/:filename', serveGeneratedImage);

export default router;
