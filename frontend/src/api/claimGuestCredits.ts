import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';

export interface ClaimGuestCreditsResponse {
  transferred: number;
  credits: number | null;
}

export async function claimGuestCredits(): Promise<ClaimGuestCreditsResponse | null> {
  let response: Response;

  try {
    response = await authApiFetch('/api/auth/claim-guest-credits', {
      method: 'POST',
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  try {
    return await parseApiResponse<ClaimGuestCreditsResponse>(response);
  } catch {
    return null;
  }
}
