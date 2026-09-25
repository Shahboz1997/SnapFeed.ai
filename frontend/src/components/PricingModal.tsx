import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Check, X, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createLemonCheckout, openLemonCheckout } from '../api/billing';
import { ApiError } from '../api/generateImage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { GUEST_CREDITS_INITIAL } from '../constants/guestCredits';
import {
  PRICING_TIERS,
  formatDepositAmount,
  formatPerCredit,
  type PricingTierPrices,
} from '../constants/depositCurrency';
import { COMPANY } from '../constants/company';
import { buildCreditPurchaseMailto, getSupportEmail } from '../utils/supportContact';
import BottomSheet from './BottomSheet';
import Spinner from './Spinner';

type PricingTier = PricingTierPrices;

const TIERS: PricingTier[] = PRICING_TIERS;

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  credits?: number;
  welcome?: boolean;
}

function TiltCard({
  children,
  popular,
}: {
  children: ReactNode;
  popular?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg)' });
  const [glow, setGlow] = useState({ x: 50, y: 50, opacity: 0 });

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 10;
    const rotateX = (0.5 - py) * 8;
    setStyle({ transform: `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)` });
    setGlow({ x: px * 100, y: py * 100, opacity: 0.35 });
  }

  function handleLeave() {
    setStyle({ transform: 'perspective(800px) rotateX(0deg) rotateY(0deg)' });
    setGlow((g) => ({ ...g, opacity: 0 }));
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={style}
      className={`relative rounded-2xl border p-4 transition-transform duration-150 will-change-transform ${
        popular ? 'border-zinc-900/30 bg-white shadow-sm' : 'border-zinc-200/80 bg-white'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity"
        style={{
          opacity: glow.opacity,
          background: `radial-gradient(circle at ${glow.x}% ${glow.y}%, rgba(24,24,27,0.06), transparent 55%)`,
        }}
      />
      {children}
    </div>
  );
}

export default function PricingModal({
  open,
  onClose,
  credits = 0,
  welcome = false,
}: PricingModalProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { user, authEnabled, signInWithGoogle, refreshProfile } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null);
  const [cardCheckoutUnavailable, setCardCheckoutUnavailable] = useState(false);
  const checkoutInFlight = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open) {
      setSigningIn(false);
      setSignInError(null);
      setCheckoutError(null);
      setCheckoutPlan(null);
      setCardCheckoutUnavailable(false);
      checkoutInFlight.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      window.createLemonSqueezy?.();
    } catch {
      // Lemon.js optional until keys are wired
    }
  }, [open]);

  useEffect(() => () => {
    if (refreshTimerRef.current != null) {
      window.clearTimeout(refreshTimerRef.current);
    }
  }, []);

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

  async function handleSelectPlan(tier: PricingTier) {
    if (!user || checkoutInFlight.current) return;
    checkoutInFlight.current = true;
    setCheckoutError(null);
    setCheckoutPlan(tier.id);

    try {
      const redirectUrl = `${window.location.origin}/cabinet?checkout=success`;
      const result = await createLemonCheckout(tier.id, redirectUrl);
      openLemonCheckout(result.checkoutUrl);
      showToast(t('pricing.checkoutOpened'), 'success');
      onClose();
      refreshTimerRef.current = window.setTimeout(() => {
        void refreshProfile();
      }, 2500);
    } catch (err) {
      if (err instanceof ApiError && err.messageKey === 'pricing.lemonNotConfigured') {
        setCardCheckoutUnavailable(true);
        setCheckoutError(t('pricing.lemonNotConfigured'));
      } else if (err instanceof ApiError && err.messageKey) {
        const translated = t(err.messageKey);
        setCheckoutError(translated !== err.messageKey ? translated : err.message);
      } else if (err instanceof Error) {
        setCheckoutError(err.message);
      } else {
        setCheckoutError(t('pricing.checkoutFailed'));
      }
    } finally {
      checkoutInFlight.current = false;
      setCheckoutPlan(null);
    }
  }

  const supportMailto = buildCreditPurchaseMailto({
    subject: t('pricing.mailSubject', { tier: 'credits' }),
    body: t('pricing.mailBody', {
      brand: COMPANY.brand,
      email: user?.email ?? '',
    }),
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      labelledBy="pricing-modal-title"
      maxWidthClass="max-w-lg"
      closeLabel={t('pricing.close')}
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-1 -top-1 z-20 flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          aria-label={t('pricing.close')}
        >
          <X className="h-4 w-4" />
        </button>

        {!user ? (
          <>
            <h2 id="pricing-modal-title" className="mb-2 pr-10 font-display text-xl font-bold tracking-tight text-zinc-900">
              {t('pricing.guestTitle')}
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-zinc-500">
              {t('pricing.guestDescription', { count: GUEST_CREDITS_INITIAL })}
            </p>

            <ul className="mb-6 space-y-2.5 text-sm text-zinc-700">
              {[
                t('pricing.guestBenefit1', { count: GUEST_CREDITS_INITIAL }),
                t('pricing.guestBenefit2'),
                t('pricing.guestBenefit3'),
              ].map((text) => (
                <li key={text} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  {text}
                </li>
              ))}
            </ul>

            {!authEnabled && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {t('auth.notConfigured')}
              </div>
            )}

            {signInError && (
              <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {signInError}
              </div>
            )}

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={!authEnabled || signingIn}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3.5 text-base font-semibold text-zinc-900 transition hover:border-zinc-300 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
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

            <p className="mt-4 text-center text-xs text-zinc-400">{t('auth.loginHint')}</p>
          </>
        ) : (
          <>
            {welcome ? (
              <>
                <h2 id="pricing-modal-title" className="mb-2 pr-10 font-display text-xl font-bold tracking-tight text-zinc-900">
                  {t('pricing.welcomeTitle')}
                </h2>
                <p className="mb-4 text-sm text-zinc-500">{t('pricing.welcomeDescription')}</p>
                {credits > 0 && (
                  <div className="mb-5 flex items-center gap-3 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3">
                    <Zap className="h-5 w-5 shrink-0 text-zinc-700" fill="currentColor" />
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                        {t('auth.creditsLabel')}
                      </p>
                      <p className="text-2xl font-bold tabular-nums text-zinc-900">{credits}</p>
                    </div>
                  </div>
                )}
                <p className="mb-5 text-sm text-zinc-500">{t('pricing.welcomeHint')}</p>
              </>
            ) : (
              <>
                <h2 id="pricing-modal-title" className="mb-2 pr-10 font-display text-xl font-bold tracking-tight text-zinc-900">
                  {t('pricing.title')}
                </h2>
                <p className="mb-4 text-sm text-zinc-500">{t('pricing.description')}</p>
              </>
            )}

            {cardCheckoutUnavailable ? (
              <div className="mb-5 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800">
                  {t('pricing.lemonNotConfigured')}
                </div>
                <a
                  href={supportMailto}
                  className="flex w-full items-center justify-center rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  {t('pricing.contactButton')} · {getSupportEmail()}
                </a>
              </div>
            ) : (
              <>
                <div className="mb-5 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-500">
                  {t('pricing.lemonNotice', { brand: COMPANY.brand })}
                </div>

                {checkoutError && (
                  <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {checkoutError}
                  </div>
                )}

                <div className="space-y-3">
                  {TIERS.map((tier) => {
                    const amount = tier.priceUsd;
                    const perCredit = amount / tier.credits;
                    const busy = checkoutPlan === tier.id;
                    return (
                      <TiltCard key={tier.id} popular={tier.popular}>
                        {tier.popular && (
                          <span className="absolute -top-2.5 left-4 rounded-md border border-zinc-900/20 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-900 backdrop-blur-md">
                            {t('pricing.popular')}
                          </span>
                        )}
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-zinc-900">
                              {tier.subscription
                                ? t('pricing.monthlyPack', { count: tier.credits })
                                : t('pricing.creditsPack', { count: tier.credits })}
                            </p>
                            {tier.subscription ? (
                              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">
                                {t('pricing.subscriptionBadge')}
                              </p>
                            ) : null}
                            <p className="text-xs text-zinc-500">
                              {formatDepositAmount(amount, 'USD')}
                            </p>
                            <p className="mt-0.5 text-[10px] text-zinc-400">
                              {t('pricing.perCreditApprox', {
                                price: formatPerCredit(perCredit, 'USD'),
                              })}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleSelectPlan(tier)}
                            disabled={Boolean(checkoutPlan) || checkoutInFlight.current}
                            className={`inline-flex min-h-11 min-w-[6.5rem] items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold transition disabled:opacity-60 ${
                              tier.popular
                                ? 'bg-zinc-900 text-white hover:bg-zinc-800'
                                : 'border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                            }`}
                          >
                            {busy ? <Spinner className="h-3.5 w-3.5" /> : t('pricing.buyButton')}
                          </button>
                        </div>
                      </TiltCard>
                    );
                  })}
                </div>

                <p className="mt-5 text-center text-xs text-zinc-400">{t('pricing.hint')}</p>
              </>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
}
