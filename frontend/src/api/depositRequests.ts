import { authApiFetch } from './authFetch';
import { ApiError } from './generateImage';
import {
  formatDepositAmount,
  normalizeDepositCurrency,
  type DepositCurrency,
} from '../constants/depositCurrency';

export type { DepositCurrency };
export { formatDepositAmount };

export type DepositPlanName = 'single' | 'starter' | 'pro' | 'business' | 'monthly';

export type DepositRequestStatus = 'pending' | 'approved' | 'rejected';

export interface DepositInvoiceDraft {
  success: true;
  /** null until user taps “I paid” and the request is created */
  requestId: string | null;
  amount: number;
  currency: DepositCurrency;
  credits: number;
  planName: DepositPlanName;
  planLabel: string;
  status: DepositRequestStatus | null;
  paymentDetails: string;
}

export type CreateDepositRequestResult = DepositInvoiceDraft & {
  requestId: string;
  status: DepositRequestStatus;
};

export interface DepositRequestItem {
  id: string;
  planName: DepositPlanName;
  amount: number;
  currency: DepositCurrency;
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

function mapAuthBillingError(response: Response, err: ApiError): ApiError {
  // Generation copy ("sign in to generate images") is wrong in the billing modal.
  if (
    response.status === 401
    && (err.messageKey === 'api.authRequired' || err.messageKey === 'api.authInvalid')
  ) {
    return new ApiError(err.message, response.status, 'pricing.authRequired');
  }
  return err;
}

/** Load payment details for a plan without creating a deposit_requests row. */
export async function previewDepositRequest(
  planName: DepositPlanName,
  currency: DepositCurrency = 'RUB',
): Promise<DepositInvoiceDraft> {
  const response = await authApiFetch('/api/auth/preview-deposit', {
    method: 'POST',
    body: JSON.stringify({ planName, currency }),
  });

  if (!response.ok) {
    throw mapAuthBillingError(response, await readError(response));
  }

  const data = await response.json() as DepositInvoiceDraft;
  if (!data?.success || !data.paymentDetails) {
    throw new ApiError('Invalid deposit preview.', 500, 'pricing.depositCreateFailed');
  }

  return {
    ...data,
    requestId: data.requestId ?? null,
    status: data.status ?? null,
    currency: normalizeDepositCurrency(data.currency),
  };
}

export async function createDepositRequest(
  planName: DepositPlanName,
  currency: DepositCurrency = 'RUB',
): Promise<CreateDepositRequestResult> {
  const response = await authApiFetch('/api/auth/create-deposit-request', {
    method: 'POST',
    body: JSON.stringify({ planName, currency }),
  });

  if (!response.ok) {
    throw mapAuthBillingError(response, await readError(response));
  }

  const data = await response.json() as CreateDepositRequestResult;
  if (!data?.success || !data.requestId) {
    throw new ApiError('Invalid deposit response.', 500, 'pricing.depositCreateFailed');
  }

  return {
    ...data,
    currency: normalizeDepositCurrency(data.currency),
  };
}

export async function listDepositRequests(): Promise<DepositRequestItem[]> {
  const response = await authApiFetch('/api/auth/deposit-requests', {
    method: 'GET',
  });

  if (!response.ok) {
    throw await readError(response);
  }

  const data = await response.json() as { requests?: DepositRequestItem[] };
  return Array.isArray(data.requests)
    ? data.requests.map((item) => ({
      ...item,
      currency: normalizeDepositCurrency(item.currency),
    }))
    : [];
}

export async function notifyDepositPaid(requestId: string): Promise<void> {
  const response = await authApiFetch('/api/auth/notify-deposit-paid', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    throw await readError(response);
  }
}
