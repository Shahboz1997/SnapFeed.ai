import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createLemonCheckout, openLemonCheckout, type CheckoutPlanName } from '../api/billing';
import { ApiError } from '../api/generateImage';
import { COMPANY } from '../constants/company';
import {
  formatDepositAmount,
  orderedPricingTiers,
  type PricingTierPrices,
} from '../constants/depositCurrency';
import { writePendingCheckoutPlan } from '../constants/authFlow';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

type PricingPlansProps = {
  id?: string;
  showIntro?: boolean;
  onRequireAuth?: () => void;
  autoStartPlan?: CheckoutPlanName | null;
};

const PLAN_NAME_KEY: Record<PricingTierPrices['id'], string> = {
  single: 'pricing.planSingle',
  starter: 'pricing.planStarter',
  pro: 'pricing.planPro',
  business: 'pricing.planBusiness',
  monthly: 'pricing.planMonthly',
};

export default function PricingPlans({
  id = 'pricing',
  showIntro = true,
  onRequireAuth,
  autoStartPlan = null,
}: PricingPlansProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [busyPlan, setBusyPlan] = useState<CheckoutPlanName | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedPlan = useRef<CheckoutPlanName | null>(null);
  const tiers = orderedPricingTiers();

  async function buy(planName: CheckoutPlanName) {
    setError(null);

    if (!user) {
      writePendingCheckoutPlan(planName);
      if (onRequireAuth) onRequireAuth();
      else navigate('/login');
      return;
    }

    setBusyPlan(planName);
    try {
      const redirectUrl = `${window.location.origin}/cabinet?checkout=success`;
      const result = await createLemonCheckout(planName, redirectUrl);
      openLemonCheckout(result.checkoutUrl);
    } catch (err) {
      const key = err instanceof ApiError && err.messageKey
        ? err.messageKey
        : 'pricing.checkoutFailed';
      setError(t(key));
    } finally {
      setBusyPlan(null);
    }
  }

  useEffect(() => {
    if (!autoStartPlan || !user || startedPlan.current === autoStartPlan) return;
    startedPlan.current = autoStartPlan;
    void buy(autoStartPlan);
    // Resume a pack chosen before sign-in. `buy` closes over the latest user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartPlan, user]);

  return (
    <section id={id} className="scroll-mt-24">
      {showIntro ? (
        <div className="mb-5">
          <h2 className="font-display text-xl tracking-tight text-zinc-900 sm:text-3xl">
            {t('pricing.title')}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-500">
            {t('pricing.topUpDescription')}
          </p>
        </div>
      ) : null}

      <p className="text-sm text-zinc-600">{t('pricing.creditEquals')}</p>
      <p className="mt-1 text-sm text-zinc-500">{t('pricing.currencyNote')}</p>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {tiers.map((tier) => {
          const price = formatDepositAmount(tier.priceUsd, 'USD');
          const priceLabel = tier.subscription
            ? t('pricing.pricePerMonth', { price })
            : price;
          const creditsLabel = tier.subscription
            ? t('pricing.monthlyPack', { count: tier.credits })
            : t('pricing.creditsPack', { count: tier.credits });
          const busy = busyPlan === tier.id;

          return (
            <li
              key={tier.id}
              className={`flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between ${
                tier.popular ? 'border-zinc-900 shadow-sm' : 'border-zinc-200'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold text-zinc-900">{t(PLAN_NAME_KEY[tier.id])}</p>
                  {tier.popular ? (
                    <span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      {t('pricing.popular')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-zinc-600">{creditsLabel}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {tier.subscription ? t('pricing.subscription') : t('pricing.oneTime')}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <p className="text-lg font-bold tabular-nums text-zinc-900">{priceLabel}</p>
                <button
                  type="button"
                  onClick={() => void buy(tier.id)}
                  disabled={busyPlan !== null}
                  className="inline-flex h-10 min-w-24 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busy ? <Spinner className="h-4 w-4" /> : t('pricing.buyButton')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-zinc-400">{t('pricing.nonTransferable')}</p>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        {t('pricing.lemonNotice', { brand: COMPANY.brand })}
      </p>
    </section>
  );
}
