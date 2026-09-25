import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import {
  PRICING_TIERS,
  formatDepositAmount,
  formatPerCredit,
  tierAmountForCurrency,
  type PricingTierPrices,
} from '../constants/depositCurrency';

const LANDING_CURRENCY = 'USD' as const;

/** Featured landing packs — large cards. */
const FEATURED_IDS = ['starter', 'pro', 'business'] as const;
/** Compact row under featured. */
const COMPACT_IDS = ['single', 'monthly'] as const;

interface LandingPricingCardProps {
  onSelectPlan: () => void;
}

function tierById(id: string): PricingTierPrices {
  const tier = PRICING_TIERS.find((item) => item.id === id);
  if (!tier) throw new Error(`Missing pricing tier: ${id}`);
  return tier;
}

export default function LandingPricingCard({ onSelectPlan }: LandingPricingCardProps) {
  const { t } = useTranslation();

  return (
    <section className="relative mt-12 overflow-hidden sm:mt-20 lg:mt-24">
      <div
        className="pointer-events-none absolute inset-x-0 top-8 -z-0 h-64 bg-[radial-gradient(ellipse_at_center,rgba(24,24,27,0.06),transparent_70%)]"
        aria-hidden="true"
      />

      <div className="relative z-[1] mx-auto max-w-2xl text-center">
        <motion.h3
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          className="font-display text-xl tracking-tight text-zinc-900 sm:text-3xl"
        >
          {t('home.pricingTitle')}
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ delay: 0.04 }}
          className="mt-2 text-sm leading-relaxed text-zinc-500 sm:mt-3 sm:text-base"
        >
          {t('home.pricingSubtitle')}
        </motion.p>
      </div>

      <div className="relative z-[1] mx-auto mt-8 grid max-w-4xl gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 sm:items-stretch">
        {FEATURED_IDS.map((id, index) => {
          const tier = tierById(id);
          const amount = tierAmountForCurrency(tier, LANDING_CURRENCY);
          const perCredit = amount / tier.credits;
          const popular = Boolean(tier.popular);

          return (
            <motion.article
              key={tier.id}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ delay: 0.06 + index * 0.06 }}
              className={`relative flex flex-col rounded-[1.35rem] p-5 sm:rounded-[1.5rem] sm:p-6 ${
                popular
                  ? 'border border-zinc-900 bg-zinc-900 text-white shadow-[0_24px_60px_-28px_rgba(24,24,27,0.55)] sm:scale-[1.03] sm:py-7'
                  : 'border border-zinc-200/80 bg-white shadow-[0_16px_40px_-28px_rgba(24,24,27,0.35)]'
              }`}
            >
              {popular ? (
                <span className="mb-4 inline-flex w-fit rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                  {t('pricing.popular')}
                </span>
              ) : (
                <span className="mb-4 inline-flex h-6 items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                  {t(`home.pricingTierLabel.${tier.id}`)}
                </span>
              )}

              <p
                className={`font-display text-[2rem] leading-none tracking-tight sm:text-[2.25rem] ${
                  popular ? 'text-white' : 'text-zinc-900'
                }`}
              >
                {formatDepositAmount(amount, LANDING_CURRENCY)}
              </p>

              <p className={`mt-3 text-sm font-semibold ${popular ? 'text-white' : 'text-zinc-900'}`}>
                {t('pricing.creditsPack', { count: tier.credits })}
              </p>
              <p className={`mt-1 text-xs ${popular ? 'text-zinc-400' : 'text-zinc-500'}`}>
                {t('pricing.perCreditApprox', {
                  price: formatPerCredit(perCredit, LANDING_CURRENCY),
                })}
              </p>

              <ul className={`mt-5 space-y-2 text-xs ${popular ? 'text-zinc-300' : 'text-zinc-500'}`}>
                <li className="flex items-start gap-2">
                  <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${popular ? 'text-white' : 'text-zinc-900'}`} strokeWidth={2.5} />
                  <span>{t('home.pricingFeatureGenerations', { count: tier.credits })}</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${popular ? 'text-white' : 'text-zinc-900'}`} strokeWidth={2.5} />
                  <span>{t('home.pricingFeatureModes')}</span>
                </li>
              </ul>

              <button
                type="button"
                onClick={onSelectPlan}
                className={`mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold transition ${
                  popular
                    ? 'bg-white text-zinc-900 hover:bg-zinc-100'
                    : 'bg-zinc-900 text-white hover:bg-zinc-800'
                }`}
              >
                {t('pricing.selectPlan')}
              </button>
            </motion.article>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ delay: 0.2 }}
        className="relative z-[1] mx-auto mt-3 grid max-w-4xl gap-3 sm:mt-4 sm:grid-cols-2"
      >
        {COMPACT_IDS.map((id) => {
          const tier = tierById(id);
          const amount = tierAmountForCurrency(tier, LANDING_CURRENCY);
          const perCredit = amount / tier.credits;

          return (
            <div
              key={tier.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200/70 bg-white/90 px-4 py-3.5 backdrop-blur-sm sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900">
                  {tier.subscription
                    ? t('pricing.monthlyPack', { count: tier.credits })
                    : t('pricing.creditsPack', { count: tier.credits })}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {formatDepositAmount(amount, LANDING_CURRENCY)}
                  <span className="text-zinc-400">
                    {' · '}
                    {t('pricing.perCreditApprox', {
                      price: formatPerCredit(perCredit, LANDING_CURRENCY),
                    })}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onSelectPlan}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                {t('pricing.selectPlan')}
              </button>
            </div>
          );
        })}
      </motion.div>

      <p className="relative z-[1] mx-auto mt-5 max-w-lg text-center text-[11px] leading-relaxed text-zinc-400 sm:mt-6">
        {t('home.pricingLegalNote')}{' '}
        <Link to="/terms" className="underline-offset-2 hover:text-zinc-600 hover:underline">
          {t('legal.footer.terms')}
        </Link>
        {' · '}
        <Link to="/refund" className="underline-offset-2 hover:text-zinc-600 hover:underline">
          {t('legal.footer.refunds')}
        </Link>
      </p>
    </section>
  );
}
