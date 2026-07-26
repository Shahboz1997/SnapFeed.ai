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

function buildDepositPaidContent({
  requestId,
  userEmail,
  userId,
  planName,
  planLabel,
  amount,
  currency,
  credits,
}) {
  const subject = `[SnapFeed] Payment notified — ${planLabel} (${amount} ${currency})`;
  const text = [
    'User tapped “I paid — notify admin”.',
    '',
    `Request ID: ${requestId}`,
    `User email: ${userEmail || '—'}`,
    `User ID: ${userId}`,
    `Plan: ${planLabel} (${planName})`,
    `Amount: ${amount} ${currency}`,
    `Credits: ${credits}`,
    '',
    'Approve the deposit in Supabase (deposit_requests) after verifying the transfer.',
  ].join('\n');

  const html = `
    <p><strong>User tapped “I paid — notify admin”.</strong></p>
    <ul>
      <li><strong>Request ID:</strong> ${requestId}</li>
      <li><strong>User email:</strong> ${userEmail || '—'}</li>
      <li><strong>User ID:</strong> ${userId}</li>
      <li><strong>Plan:</strong> ${planLabel} (${planName})</li>
      <li><strong>Amount:</strong> ${amount} ${currency}</li>
      <li><strong>Credits:</strong> ${credits}</li>
    </ul>
    <p>Approve the deposit in Supabase (<code>deposit_requests</code>) after verifying the transfer.</p>
  `;

  return { subject, text, html };
}

async function sendViaSmtp({ to, subject, text, html }) {
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

  await transporter.sendMail({ from, to, subject, text, html });
}

async function sendViaResend({ to, subject, text, html }) {
  const from = process.env.RESEND_FROM?.trim() || 'SnapFeed <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Resend error ${response.status}: ${body || response.statusText}`);
  }
}

/** Send any transactional email via SMTP (preferred) or Resend. */
export async function sendViaConfiguredProvider({ to, subject, text, html }) {
  if (!isAdminEmailConfigured()) {
    const err = new Error('Email is not configured.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  if (isSmtpConfigured()) {
    await sendViaSmtp({ to, subject, text, html });
    return { to, provider: 'smtp' };
  }

  await sendViaResend({ to, subject, text, html });
  return { to, provider: 'resend' };
}

/**
 * Notify admin that a user paid for a deposit request.
 * Prefers SMTP when configured; otherwise Resend.
 */
export async function sendDepositPaidAdminEmail(payload) {
  if (!isAdminEmailConfigured()) {
    const err = new Error('Admin email is not configured.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const to = getAdminNotifyEmail();
  const content = buildDepositPaidContent(payload);
  const result = await sendViaConfiguredProvider({ to, ...content });
  return result;
}
