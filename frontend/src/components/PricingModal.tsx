import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { GUEST_CREDITS_INITIAL } from '../constants/guestCredits';
import { buildCreditPurchaseMailto } from '../utils/supportContact';
import Spinner from './Spinner';

interface PricingTier {
  id: string;
  credits: number;
  price: string;
  popular?: boolean;
}

// Keep in sync with backend/constants/pricingTiers.js (PRICING_TIERS).
const TIERS: PricingTier[] = [
  { id: 'starter', credits: 10, price: '$1.49' },
  { id: 'pro', credits: 50, price: '$6.99', popular: true },
  { id: 'business', credits: 200, price: '$27.99' },
];

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  credits?: number;
  welcome?: boolean;
}

export default function PricingModal({ open, onClose, credits = 0, welcome = false }: PricingModalProps) {
  const { t } = useTranslation();
  const { user, authEnabled, signInWithGoogle } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  if (!open) return null;

  async function handleGoogleSignIn() {
    setSigningIn(true);
    setSignInError(null);

    try {
      await signInWithGoogle();
    } catch {
      setSignInError(t('auth.signInFailed'));
      setSigningIn(false);
    }
  }

  function handleContact(tier: PricingTier) {
    const tierLabel = t('pricing.creditsPack', { count: tier.credits });
    const mailto = buildCreditPurchaseMailto({
      subject: t('pricing.mailSubject', { tier: tierLabel }),
      body: t('pricing.mailBody', {
        tier: tierLabel,
        price: tier.price,
        email: user?.email ?? '',
      }),
    });

    window.location.href = mailto;
  }

  if (!user) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
          aria-label={t('pricing.close')}
          onClick={onClose}
        />

        <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-slate-200/80 bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label={t('pricing.close')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <h2 id="pricing-modal-title" className="mb-2 text-xl font-extrabold tracking-tight text-slate-900">
            {t('pricing.guestTitle')}
          </h2>
          <p className="mb-5 text-sm leading-relaxed text-slate-500">
            {t('pricing.guestDescription', { count: GUEST_CREDITS_INITIAL })}
          </p>

          <ul className="mb-6 space-y-2.5 text-sm text-slate-600">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
              {t('pricing.guestBenefit1', { count: GUEST_CREDITS_INITIAL })}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
              {t('pricing.guestBenefit2')}
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
              {t('pricing.guestBenefit3')}
            </li>
          </ul>

          {!authEnabled && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('auth.notConfigured')}
            </div>
          )}

          {signInError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {signInError}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={!authEnabled || signingIn}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingIn ? <Spinner /> : (
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {t('auth.signInWithGoogle')}
          </button>

          <p className="mt-4 text-center text-xs text-slate-400">{t('auth.loginHint')}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        aria-label={t('pricing.close')}
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-slate-200/80 bg-white p-6 shadow-2xl sm:rounded-2xl sm:p-8">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label={t('pricing.close')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {welcome ? (
          <>
            <h2 id="pricing-modal-title" className="mb-2 text-xl font-extrabold tracking-tight text-slate-900">
              {t('pricing.welcomeTitle')}
            </h2>
            <p className="mb-4 text-sm text-slate-500">{t('pricing.welcomeDescription')}</p>
            {credits > 0 && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true">
                  <path d="M12 2L3.5 13H11V22L19.5 11H12V2Z" />
                </svg>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{t('auth.creditsLabel')}</p>
                  <p className="text-2xl font-bold tabular-nums text-amber-900">{credits}</p>
                </div>
              </div>
            )}
            <p className="mb-5 text-sm text-slate-500">{t('pricing.welcomeHint')}</p>
          </>
        ) : (
          <>
            <h2 id="pricing-modal-title" className="mb-2 text-xl font-extrabold tracking-tight text-slate-900">
              {t('pricing.title')}
            </h2>
            <p className="mb-4 text-sm text-slate-500">{t('pricing.description')}</p>
          </>
        )}

        <div className="mb-5 rounded-xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm leading-relaxed text-amber-900">
          {t('pricing.manualPaymentNotice')}
        </div>

        <div className="space-y-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`relative flex items-center justify-between rounded-xl border px-4 py-4 transition ${
                tier.popular
                  ? 'border-amber-300 bg-amber-50/60 shadow-sm'
                  : 'border-slate-200/80 bg-slate-50/50'
              }`}
            >
              {tier.popular && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {t('pricing.popular')}
                </span>
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {t('pricing.creditsPack', { count: tier.credits })}
                </p>
                <p className="text-xs text-slate-500">{tier.price}</p>
              </div>
              <button
                type="button"
                onClick={() => handleContact(tier)}
                className={`rounded-lg px-4 py-2 text-xs font-semibold transition ${
                  tier.popular
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {t('pricing.contactButton')}
              </button>
            </div>
          ))}
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">{t('pricing.hint')}</p>
      </div>
    </div>
  );
}
