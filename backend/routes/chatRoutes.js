import express from 'express';
import { chatAssistant } from '../controllers/chatController.js';
import { optionalAuth } from '../middleware/supabaseAuth.js';

const router = express.Router();

router.post('/chat-assistant', optionalAuth, chatAssistant);
router.post('/chat/generate-prompt', optionalAuth, chatAssistant);

export default router;
