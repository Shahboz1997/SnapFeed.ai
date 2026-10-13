import express from 'express';
import rateLimit from 'express-rate-limit';
import { optionalAuth } from '../middleware/supabaseAuth.js';
import {
  isAdminEmailConfigured,
  sendViaConfiguredProvider,
} from '../services/adminNotifyEmail.js';

const router = express.Router();

const DEFAULT_SUPPORT_EMAIL = 'supportstratum@gmail.com';

function creditRequestInbox() {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}

const creditRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler(_req, res) {
    res.status(429).json({
      error: 'Too many requests. Please try again later.',
      messageKey: 'api.rateLimited',
    });
  },
});

function cleanText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.post('/support/credits', creditRequestLimiter, optionalAuth, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 120);
    const email = cleanText(req.body?.email, 200);
    const message = cleanText(req.body?.message, 2000);
    const creditsRaw = Number(req.body?.credits);
    const credits = Number.isFinite(creditsRaw) && creditsRaw > 0
      ? Math.min(Math.round(creditsRaw), 100000)
      : null;

    if (!name || !email || !message) {
      return res.status(400).json({
        error: 'Name, email, and message are required.',
        messageKey: 'creditRequest.required',
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: 'Enter a valid email.',
        messageKey: 'creditRequest.emailInvalid',
      });
    }

    const subject = `snapfeed.help — credit request from ${name}`;
    const text = [
      'Credit request from snapfeed.help',
      '',
      `Name: ${name}`,
      `Email: ${email}`,
      `Credits: ${credits ?? 'not specified'}`,
      req.user?.email ? `Account email: ${req.user.email}` : null,
      '',
      message,
    ].filter(Boolean).join('\n');

    const html = `
      <p><strong>Credit request</strong> from snapfeed.help</p>
      <p>Name: ${escapeHtml(name)}<br>
      Email: ${escapeHtml(email)}<br>
      Credits: ${credits ?? 'not specified'}</p>
      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>
    `;

    if (!isAdminEmailConfigured()) {
      return res.status(503).json({
        error: 'Email is not configured.',
        messageKey: 'creditRequest.emailUnavailable',
        fallback: 'mailto',
      });
    }

    await sendViaConfiguredProvider({
      to: creditRequestInbox(),
      replyTo: email,
      subject,
      text,
      html,
      prefer: 'resend',
    });

    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
