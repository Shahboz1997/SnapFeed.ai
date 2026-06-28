const DEFAULT_SUPPORT_EMAIL = 'supportstratum@gmail.com';

export function getSupportEmail(): string {
  const configured = import.meta.env.VITE_SUPPORT_EMAIL?.trim();
  return configured || DEFAULT_SUPPORT_EMAIL;
}

export function buildMailtoLink({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): string {
  return `mailto:${getSupportEmail()}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function buildCreditPurchaseMailto({
  subject,
  body,
}: {
  subject: string;
  body: string;
}): string {
  return buildMailtoLink({ subject, body });
}
