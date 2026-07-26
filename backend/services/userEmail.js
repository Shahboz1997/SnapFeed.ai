import {
  isAdminEmailConfigured,
  sendViaConfiguredProvider,
} from './adminNotifyEmail.js';

const APP_URL = () => (
  process.env.APP_PUBLIC_URL?.trim()
  || process.env.CORS_ORIGIN?.split(',')[0]?.trim()
  || 'https://snapfeed.help'
);

export function isUserEmailConfigured() {
  return isAdminEmailConfigured();
}

function studioUrl() {
  return `${APP_URL().replace(/\/$/, '')}/studio`;
}

function pricingUrl() {
  return `${APP_URL().replace(/\/$/, '')}/cabinet`;
}

export async function sendWelcomeUserEmail({ email, fullName, credits = 3 }) {
  if (!email || !isUserEmailConfigured()) return null;

  const name = fullName?.trim() || 'there';
  const subject = 'Welcome to SnapFeed — your free credits are ready';
  const text = [
    `Hi ${name},`,
    '',
    `Your SnapFeed account is ready with ${credits} free credit(s).`,
    'Open the Studio and create your first look:',
    studioUrl(),
    '',
    'Tip: try Product → Model with a clear garment photo for the best first result.',
    '',
    '— SnapFeed.ai',
  ].join('\n');

  const html = `
    <p>Hi <strong>${name}</strong>,</p>
    <p>Your SnapFeed account is ready with <strong>${credits}</strong> free credit(s).</p>
    <p><a href="${studioUrl()}">Open Studio</a> and create your first look.</p>
    <p style="color:#71717a">Tip: try Product → Model with a clear garment photo for the best first result.</p>
    <p>— SnapFeed.ai</p>
  `;

  return sendViaConfiguredProvider({ to: email, subject, text, html });
}

export async function sendLowCreditsUserEmail({ email, fullName, credits = 0 }) {
  if (!email || !isUserEmailConfigured()) return null;

  const name = fullName?.trim() || 'there';
  const subject = credits <= 0
    ? 'Your SnapFeed credits ran out — top up to keep creating'
    : `Only ${credits} SnapFeed credit left`;

  const text = [
    `Hi ${name},`,
    '',
    credits <= 0
      ? 'You’re out of credits. Top up to keep generating try-ons and packshots.'
      : `You have ${credits} credit left. Top up so you don’t get stuck mid-session.`,
    pricingUrl(),
    '',
    '— SnapFeed.ai',
  ].join('\n');

  const html = `
    <p>Hi <strong>${name}</strong>,</p>
    <p>${
      credits <= 0
        ? 'You’re out of credits. Top up to keep generating try-ons and packshots.'
        : `You have <strong>${credits}</strong> credit left. Top up so you don’t get stuck mid-session.`
    }</p>
    <p><a href="${pricingUrl()}">Top up credits</a></p>
    <p>— SnapFeed.ai</p>
  `;

  return sendViaConfiguredProvider({ to: email, subject, text, html });
}
