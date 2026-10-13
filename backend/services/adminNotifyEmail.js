import nodemailer from 'nodemailer';

const DEFAULT_ADMIN_EMAIL = 'sashabilov25@gmail.com';

export function getAdminNotifyEmail() {
  return process.env.ADMIN_NOTIFY_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
}

function isSmtpConfigured() {
  return Boolean(
    process.env.SMTP_HOST?.trim()
    && process.env.SMTP_USER?.trim()
    && process.env.SMTP_PASS?.trim(),
  );
}

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function isAdminEmailConfigured() {
  return isSmtpConfigured() || isResendConfigured();
}

async function sendViaSmtp({ to, subject, text, html, replyTo }) {
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = process.env.SMTP_FROM?.trim()
    || process.env.SMTP_USER.trim();

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST.trim(),
    port,
    secure,
    auth: {
      user: process.env.SMTP_USER.trim(),
      pass: process.env.SMTP_PASS.trim(),
    },
  });

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
    html,
    replyTo: replyTo || undefined,
  });
}

async function sendViaResend({ to, subject, text, html, replyTo }) {
  const from = process.env.RESEND_FROM?.trim() || 'SnapFeed <noreply@snapfeed.help>';
  const payload = { from, to: [to], subject, text, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend error ${response.status}: ${body || response.statusText}`);
  }
}

/**
 * Send mail through Resend when RESEND_API_KEY is set.
 * `prefer: 'resend'` skips SMTP so credit requests use Resend even if SMTP is also configured.
 */
export async function sendViaConfiguredProvider({ to, subject, text, html, replyTo, prefer = 'auto' }) {
  if (!isAdminEmailConfigured()) {
    const err = new Error('Email is not configured.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const useResend = prefer === 'resend'
    ? isResendConfigured()
    : !isSmtpConfigured() && isResendConfigured();

  if (useResend) {
    await sendViaResend({ to, subject, text, html, replyTo });
    return { to, provider: 'resend' };
  }

  if (isSmtpConfigured()) {
    await sendViaSmtp({ to, subject, text, html, replyTo });
    return { to, provider: 'smtp' };
  }

  await sendViaResend({ to, subject, text, html, replyTo });
  return { to, provider: 'resend' };
}
