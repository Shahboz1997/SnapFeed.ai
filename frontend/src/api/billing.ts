import { authApiFetch } from './authFetch';
import { ApiError } from './generateImage';
import type { PricingTierPrices } from '../constants/depositCurrency';

export type CheckoutPlanName = PricingTierPrices['id'];

export interface CreateCheckoutResult {
  success: true;
  checkoutUrl: string;
  planName: CheckoutPlanName;
  credits: number;
  amountUsd: number;
}

async function readError(response: Response): Promise<ApiError> {
  let message = 'Request failed.';
  let messageKey: string | undefined;

  try {
    const data = await response.json() as { error?: string; messageKey?: string };
    if (data.error) message = data.error;
    if (data.messageKey) messageKey = data.messageKey;
  } catch {
    // ignore
  }

  return new ApiError(message, response.status, messageKey);
}

function mapAuthBillingError(response: Response, err: ApiError): ApiError {
  if (
    response.status === 401
    && (err.messageKey === 'api.authRequired' || err.messageKey === 'api.authInvalid')
  ) {
    return new ApiError(err.message, response.status, 'pricing.authRequired');
  }
  return err;
}

/** Create a Lemon Squeezy checkout URL for the signed-in user. */
export async function createLemonCheckout(
  planName: CheckoutPlanName,
  redirectUrl?: string,
): Promise<CreateCheckoutResult> {
  const response = await authApiFetch('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ planName, redirectUrl }),
  });

  if (!response.ok) {
    throw mapAuthBillingError(response, await readError(response));
  }

  const data = await response.json() as CreateCheckoutResult;
  if (!data?.success || !data.checkoutUrl) {
    throw new ApiError('Invalid checkout response.', 500, 'pricing.checkoutFailed');
  }

  return data;
}

declare global {
  interface Window {
    createLemonSqueezy?: () => void;
    LemonSqueezy?: {
      Url: { Open: (url: string) => void };
      Setup?: (options: { eventHandler?: (event: { event: string }) => void }) => void;
    };
  }
}

/** Open Lemon checkout overlay (falls back to new tab). */
export function openLemonCheckout(checkoutUrl: string): void {
  try {
    window.createLemonSqueezy?.();
  } catch {
    // ignore
  }

  if (window.LemonSqueezy?.Url?.Open) {
    window.LemonSqueezy.Url.Open(checkoutUrl);
    return;
  }

  window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
}
