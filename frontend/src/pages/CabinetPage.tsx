import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Copy, Zap } from 'lucide-react';
import {
  formatDepositAmount,
  listDepositRequests,
  type DepositRequestItem,
  type DepositRequestStatus,
} from '../api/depositRequests';
import { fetchReferralSummary, type ReferralSummary } from '../api/referral';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingModal from '../components/PricingModal';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

function StatusBadge({ status }: { status: DepositRequestStatus }) {
  const { t } = useTranslation();

  if (status === 'approved') {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-emerald-700 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />
        <span className="min-w-0 break-words">{t('pricing.statusApproved')}</span>
      </span>
    );
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-rose-700 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-600" />
        <span className="min-w-0 break-words">{t('pricing.statusRejected')}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold leading-tight text-amber-700 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-600" />
      <span className="min-w-0 break-words">{t('pricing.statusPending')}</span>
    </span>
  );
}

export default function CabinetPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { authEnabled, user, profile, loading, signOut, refreshProfile } = useAuth();
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [depositRequests, setDepositRequests] = useState<DepositRequestItem[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositsError, setDepositsError] = useState<string | null>(null);
  const [referral, setReferral] = useState<ReferralSummary | null>(null);

  const loadDeposits = useCallback(async () => {
    if (!user) {
      setDepositRequests([]);
      return;
    }

    setDepositsLoading(true);
    setDepositsError(null);
    try {
      const requests = await listDepositRequests();
      setDepositRequests(requests);
    } catch {
      setDepositsError(t('pricing.depositLoadFailed'));
    } finally {
      setDepositsLoading(false);
    }
  }, [t, user]);

  useEffect(() => {
    if (!loading && authEnabled && !user) {
      navigate('/login', { replace: true });
    }
  }, [authEnabled, loading, navigate, user]);

  useEffect(() => {
    if (user) {
      refreshProfile();
      void loadDeposits();
      void fetchReferralSummary().then(setReferral);
    }
  }, [loadDeposits, refreshProfile, user]);

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
      <div className="flex min-h-[100dvh] items-center justify-center bg-zinc-50">
        <Spinner />
      </div>
    );
  }

  if (authEnabled && !user) {
    return null;
  }

  const displayName = profile?.full_name || user?.email || t('auth.guest');
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const dateFormatter = new Intl.DateTimeFormat(i18n.language || 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <AppShell
      credits={profile?.credits ?? 0}
      onCreditsClick={() => setShowPricingModal(true)}
      onSignInClick={() => setShowLoginModal(true)}
    >
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PricingModal
        open={showPricingModal}
        onClose={() => {
          setShowPricingModal(false);
          void loadDeposits();
        }}
        credits={profile?.credits ?? 0}
      />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-3 py-6 sm:gap-6 sm:px-6 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <Link to="/studio" className="min-w-0 truncate text-sm font-medium text-zinc-500 transition hover:text-zinc-900">
            ← {t('auth.backToApp')}
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="shrink-0 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:text-zinc-900"
          >
            {t('auth.signOut')}
          </button>
        </div>

        <section className="glass-panel luxury-shadow rounded-2xl p-5 sm:rounded-3xl sm:p-8">
          <h1 className="mb-5 font-display text-xl font-bold tracking-tight text-zinc-900 sm:mb-6 sm:text-2xl">
            {t('auth.cabinetTitle')}
          </h1>

          <div className="mb-8 flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-2xl border border-zinc-200/60 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-xl font-bold text-zinc-700">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-zinc-900">{displayName}</p>
              <p className="truncate text-sm text-zinc-500">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-3 sm:p-5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 sm:text-xs">
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
            <p className="mb-3 text-sm leading-relaxed text-zinc-500">{t('pricing.manualPaymentNotice')}</p>
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

            {depositsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Spinner />
              </div>
            ) : depositsError ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {depositsError}
              </p>
            ) : depositRequests.length === 0 ? (
              <p className="rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
                {t('pricing.billingEmpty')}
              </p>
            ) : (
              <ul className="grid grid-cols-2 gap-2 sm:gap-3">
                {depositRequests.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-2 rounded-2xl border border-zinc-200/60 bg-white p-3 sm:p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-xs font-semibold capitalize text-zinc-900 sm:text-sm">
                        {item.planName}
                      </span>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900 sm:text-base">
                        {formatDepositAmount(item.amount, item.currency)}
                      </p>
                    </div>
                    <div className="mt-auto flex flex-wrap items-end justify-between gap-2">
                      <p className="min-w-0 text-[11px] leading-snug text-zinc-500 sm:text-xs">
                        {dateFormatter.format(new Date(item.createdAt))}
                      </p>
                      <StatusBadge status={item.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
