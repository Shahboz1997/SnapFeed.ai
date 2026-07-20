import { authApiFetch } from './authFetch';
import { ApiError } from './generateImage';

export type DepositPlanName = 'starter' | 'pro' | 'business';

export type DepositRequestStatus = 'pending' | 'approved' | 'rejected';

export interface CreateDepositRequestResult {
  success: true;
  requestId: string;
  amount: number;
  credits: number;
  planName: DepositPlanName;
  planLabel: string;
  status: DepositRequestStatus;
  paymentDetails: string;
}

export interface DepositRequestItem {
  id: string;
  planName: DepositPlanName;
  amount: number;
  status: DepositRequestStatus;
  createdAt: string;
}

async function readError(response: Response): Promise<ApiError> {
  let message = 'Request failed.';
  let messageKey: string | undefined;

  try {
    const data = await response.json() as { error?: string; messageKey?: string };
    if (data.error) message = data.error;
    if (data.messageKey) messageKey = data.messageKey;
  } catch {
    // ignore parse errors
  }

  return new ApiError(message, response.status, messageKey);
}

export async function createDepositRequest(
  planName: DepositPlanName,
): Promise<CreateDepositRequestResult> {
  const response = await authApiFetch('/api/auth/create-deposit-request', {
    method: 'POST',
    body: JSON.stringify({ planName }),
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const data = await response.json() as CreateDepositRequestResult;
  if (!data?.success || !data.requestId) {
    throw new ApiError('Invalid deposit response.', 500, 'pricing.depositCreateFailed');
  }

  return data;
}

export async function listDepositRequests(): Promise<DepositRequestItem[]> {
  const response = await authApiFetch('/api/auth/deposit-requests', {
    method: 'GET',
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const data = await response.json() as { requests?: DepositRequestItem[] };
  return Array.isArray(data.requests) ? data.requests : [];
}
