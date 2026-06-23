import express from 'express';
import { chatAssistant } from '../controllers/chatController.js';

const router = express.Router();

router.post('/chat-assistant', chatAssistant);
router.post('/chat/generate-prompt', chatAssistant);

export default router;
