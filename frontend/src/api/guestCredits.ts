import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

interface GuestCreditsResponse {
  credits: number | null;
  isGuest: boolean;
  error?: string;
  messageKey?: string;
}

export async function fetchGuestCredits(): Promise<number | null> {
  let response: Response;

  try {
    response = await authApiFetch('/api/guest/credits');
  } catch {
    return null;
  }

  let data: GuestCreditsResponse;

  try {
    data = await parseApiResponse(response);
  } catch {
    return null;
  }

  if (!response.ok || typeof data.credits !== 'number') {
    return null;
  }

  return Math.max(0, data.credits);
}
