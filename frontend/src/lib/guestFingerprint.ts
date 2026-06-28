const FINGERPRINT_STORAGE_KEY = 'snapfeed_guest_fp';

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function collectBrowserSignals(): string {
  return [
    navigator.userAgent,
    navigator.language,
    navigator.languages?.join(',') ?? '',
    String(screen.width),
    String(screen.height),
    String(screen.colorDepth),
    String(window.devicePixelRatio ?? 1),
    new Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.hardwareConcurrency ?? 0),
    String(navigator.maxTouchPoints ?? 0),
  ].join('|');
}

export async function getGuestFingerprint(): Promise<string> {
  const stored = localStorage.getItem(FINGERPRINT_STORAGE_KEY);

  if (stored && /^[a-f0-9]{64}$/i.test(stored)) {
    return stored.toLowerCase();
  }

  const fingerprint = await sha256(collectBrowserSignals());
  localStorage.setItem(FINGERPRINT_STORAGE_KEY, fingerprint);
  return fingerprint;
}
