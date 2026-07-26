import { authApiFetch } from './authFetch';
import { ApiError } from './generateImage';
import { parseApiResponse } from './parseApiResponse';

export type ReferralSummary = {
  code: string;
  bonusCredits: number;
  invitedCount: number;
};

export async function fetchReferralSummary(): Promise<ReferralSummary | null> {
  try {
    const response = await authApiFetch('/api/auth/referral');
    const data = await parseApiResponse<ReferralSummary & { error?: string; messageKey?: string }>(response);
    if (!response.ok) return null;
    if (!data?.code) return null;
    return {
      code: data.code,
      bonusCredits: data.bonusCredits ?? 2,
      invitedCount: data.invitedCount ?? 0,
    };
  } catch {
    return null;
  }
}

export async function redeemReferralCode(code: string): Promise<{ credits: number; bonusCredits: number }> {
  let response: Response;
  try {
    response = await authApiFetch('/api/auth/referral/redeem', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  } catch {
    throw new ApiError('Unable to reach the server.', undefined, 'api.serverUnreachable');
  }

  const data = await parseApiResponse<{
    credits?: number;
    bonusCredits?: number;
    error?: string;
    messageKey?: string;
  }>(response);

  if (!response.ok) {
    throw new ApiError(
      data.error || 'Failed to apply referral.',
      response.status,
      data.messageKey || 'referral.failed',
    );
  }

  return {
    credits: data.credits ?? 0,
    bonusCredits: data.bonusCredits ?? 2,
  };
}

export async function requestWelcomeEmail(): Promise<void> {
  try {
    await authApiFetch('/api/auth/welcome-email', { method: 'POST', body: '{}' });
  } catch {
    // non-blocking
  }
}
