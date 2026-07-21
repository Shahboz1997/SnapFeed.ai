import express from 'express';
import { chatAssistant } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/supabaseAuth.js';
import { chatRateLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/chat-assistant', chatRateLimiter, optionalAuth, chatAssistant);
router.post('/chat/generate-prompt', chatRateLimiter, optionalAuth, chatAssistant);

export default router;
