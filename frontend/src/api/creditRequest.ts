import { ApiError } from './generateImage';
import { authApiFetch } from './authFetch';
import { parseApiResponse } from './parseApiResponse';
import { buildMailtoLink } from '../utils/supportContact';

export type CreditRequestInput = {
  name: string;
  email: string;
  credits?: number | null;
  message: string;
};

type CreditRequestResponse = {
  success?: boolean;
  messageKey?: string;
  error?: string;
  fallback?: string;
};

export async function submitCreditRequest(input: CreditRequestInput): Promise<'sent' | 'mailto'> {
  const response = await authApiFetch('/api/support/credits', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      credits: input.credits ?? undefined,
      message: input.message,
    }),
  });

  if (response.ok) return 'sent';

  let payload: CreditRequestResponse = {};
  try {
    payload = await parseApiResponse<CreditRequestResponse>(response);
  } catch (err) {
    if (err instanceof ApiError && err.messageKey) throw err;
  }

  if (response.status === 503 && payload.fallback === 'mailto') {
    const creditsLine = input.credits ? `Credits: ${input.credits}\n` : '';
    window.location.href = buildMailtoLink({
      subject: 'snapfeed.help — credit request',
      body: `Name: ${input.name}\nEmail: ${input.email}\n${creditsLine}\n${input.message}`,
    });
    return 'mailto';
  }

  throw new ApiError(
    payload.error || 'Could not send the request.',
    response.status,
    payload.messageKey || 'creditRequest.error',
  );
}
