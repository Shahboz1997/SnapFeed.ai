import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Zap } from 'lucide-react';
import { fetchReferralSummary, type ReferralSummary } from '../api/referral';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingModal from '../components/PricingModal';
import Spinner from '../components/Spinner';
import { COMPANY } from '../constants/company';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function CabinetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { authEnabled, user, profile, loading, signOut, refreshProfile } = useAuth();
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);

  useEffect(() => {
    if (!loading && authEnabled && !user) {
      navigate('/login', { replace: true });
    }
  }, [authEnabled, loading, navigate, user]);

  useEffect(() => {
    if (user) {
      void refreshProfile();
      void fetchReferralSummary().then(setReferral);
    }
  }, [refreshProfile, user]);

  useEffect(() => {
    if (searchParams.get('checkout') !== 'success' || !user) return;
    showToast(t('pricing.checkoutSuccess'), 'success');
    void refreshProfile();
    const next = new URLSearchParams(searchParams);
    next.delete('checkout');
    setSearchParams(next, { replace: true });
  }, [refreshProfile, searchParams, setSearchParams, showToast, t, user]);

  async function copyReferralLink() {
    if (!referral?.code) return;
    const link = `${window.location.origin}/login?ref=${encodeURIComponent(referral.code)}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast(t('referral.linkCopied'), 'success');
    } catch {
      showToast(t('pricing.copyFailed'), 'error');
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-zinc-50">
        <Spinner />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <AppShell
      credits={profile?.credits ?? 0}
      creditsLoading={loading || profile === null}
      onCreditsClick={() => setShowPricingModal(true)}
      onSignInClick={() => setShowLoginModal(true)}
    >
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PricingModal
        open={showPricingModal}
        onClose={() => setShowPricingModal(false)}
        credits={profile?.credits ?? 0}
      />

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              {t('auth.cabinetTitle')}
            </h1>
            <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/studio"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              {t('nav.studio')}
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              {t('auth.signOut')}
            </button>
          </div>
        </div>

        <section className="rounded-[1.5rem] border border-zinc-200/70 bg-white/90 p-5 shadow-[0_16px_40px_-32px_rgba(24,24,27,0.45)] sm:p-8">
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-3 sm:p-5">
              <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 sm:text-xs">
                <Zap className="h-3.5 w-3.5 shrink-0 text-zinc-700" fill="currentColor" />
                {t('auth.creditsLabel')}
              </p>
              <p className="text-2xl font-bold tabular-nums text-zinc-900 sm:text-3xl">
                {profile?.credits ?? 0}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-3 sm:p-5">
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500 sm:text-xs">
                {t('auth.planLabel')}
              </p>
              <p className="text-base font-semibold capitalize text-zinc-900 sm:text-lg">
                {profile?.plan || 'free'}
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm text-zinc-500">{t('auth.cabinetHint')}</p>

          <div className="mt-6 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5">
            <h2 className="mb-2 text-sm font-semibold text-zinc-900">{t('pricing.topUpTitle')}</h2>
            <p className="mb-3 text-sm leading-relaxed text-zinc-500">
              {t('pricing.lemonNotice', { brand: COMPANY.brand })}
            </p>
            <p className="mb-4 text-xs text-zinc-500">{t('pricing.topUpDescription')}</p>
            <button
              type="button"
              onClick={() => setShowPricingModal(true)}
              className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              {t('pricing.upgrade')}
            </button>
          </div>

          {referral ? (
            <div className="mt-6 rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5">
              <h2 className="mb-2 text-sm font-semibold text-zinc-900">{t('referral.title')}</h2>
              <p className="mb-3 text-sm leading-relaxed text-zinc-500">
                {t('referral.description', { count: referral.bonusCredits })}
              </p>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                {t('referral.codeLabel')}
              </p>
              <p className="mb-3 font-mono text-lg font-semibold tracking-wider text-zinc-900">
                {referral.code}
              </p>
              <p className="mb-4 text-xs text-zinc-500">
                {t('referral.invited', { count: referral.invitedCount })}
              </p>
              <button
                type="button"
                onClick={() => void copyReferralLink()}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
              >
                <Copy className="h-4 w-4" />
                {t('referral.copyLink')}
              </button>
            </div>
          ) : null}

          <div className="mt-8 border-t border-zinc-200/60 pt-6">
            <h2 className="mb-4 font-display text-lg font-semibold text-zinc-900">
              {t('pricing.billingHistory')}
            </h2>
            <p className="rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
              {t('pricing.billingEmpty')}
            </p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
