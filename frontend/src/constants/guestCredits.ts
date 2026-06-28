export const GUEST_CREDITS_STORAGE_KEY = 'snapfeed_guest_credits';
export const GUEST_CREDITS_INITIAL = 3;

export function readGuestCreditsFromStorage(): number | null {
  const stored = localStorage.getItem(GUEST_CREDITS_STORAGE_KEY);

  if (stored === null) {
    return null;
  }

  const parsed = Number.parseInt(stored, 10);
  if (!Number.isFinite(parsed)) {
    localStorage.removeItem(GUEST_CREDITS_STORAGE_KEY);
    return null;
  }

  return Math.max(0, parsed);
}

export function writeGuestCreditsToStorage(credits: number): void {
  localStorage.setItem(GUEST_CREDITS_STORAGE_KEY, String(Math.max(0, credits)));
}
