import express from 'express';
import {
  generatePostImage,
  downloadImage,
  serveGeneratedImage,
} from '../controllers/imageController.js';
import { generateProductImage } from '../controllers/productImageController.js';

const router = express.Router();

router.post('/generate-image', generatePostImage);
router.post('/generate-product-image', generateProductImage);
router.post('/download-image', downloadImage);
router.get('/generated-images/:filename', serveGeneratedImage);

export default router;
