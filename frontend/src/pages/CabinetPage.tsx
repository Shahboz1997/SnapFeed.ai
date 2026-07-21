import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import {
  formatDepositAmount,
  listDepositRequests,
  type DepositRequestItem,
  type DepositRequestStatus,
} from '../api/depositRequests';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingModal from '../components/PricingModal';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';

function StatusBadge({ status }: { status: DepositRequestStatus }) {
  const { t } = useTranslation();

  if (status === 'approved') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
        {t('pricing.statusApproved')}
      </span>
    );
  }

  if (status === 'rejected') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
        <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
        {t('pricing.statusRejected')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
      {t('pricing.statusPending')}
    </span>
  );
}

export default function CabinetPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { authEnabled, user, profile, loading, signOut, refreshProfile } = useAuth();
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [depositRequests, setDepositRequests] = useState<DepositRequestItem[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositsError, setDepositsError] = useState<string | null>(null);

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
    }
  }, [loadDeposits, refreshProfile, user]);

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

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
                <Zap className="h-3.5 w-3.5 text-zinc-700" fill="currentColor" />
                {t('auth.creditsLabel')}
              </p>
              <p className="text-3xl font-bold tabular-nums text-zinc-900">
                {profile?.credits ?? 0}
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-200/60 bg-zinc-50 p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                {t('auth.planLabel')}
              </p>
              <p className="text-lg font-semibold capitalize text-zinc-900">
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
              <div className="overflow-hidden rounded-2xl border border-zinc-200/60">
                <div className="hidden grid-cols-[1.2fr_1fr_0.8fr_1.1fr] gap-2 border-b border-zinc-200/60 bg-zinc-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 sm:grid">
                  <span>{t('pricing.billingDate')}</span>
                  <span>{t('pricing.billingPlan')}</span>
                  <span>{t('pricing.billingAmount')}</span>
                  <span>{t('pricing.billingStatus')}</span>
                </div>
                <ul className="divide-y divide-zinc-200/60">
                  {depositRequests.map((item) => (
                    <li
                      key={item.id}
                      className="grid grid-cols-1 gap-2 bg-white px-4 py-3 sm:grid-cols-[1.2fr_1fr_0.8fr_1.1fr] sm:items-center"
                    >
                      <span className="text-sm text-zinc-700">
                        <span className="mr-2 text-[10px] font-semibold uppercase text-zinc-400 sm:hidden">
                          {t('pricing.billingDate')}
                        </span>
                        {dateFormatter.format(new Date(item.createdAt))}
                      </span>
                      <span className="text-sm capitalize text-zinc-700">
                        <span className="mr-2 text-[10px] font-semibold uppercase text-zinc-400 sm:hidden">
                          {t('pricing.billingPlan')}
                        </span>
                        {item.planName}
                      </span>
                      <span className="text-sm font-semibold tabular-nums text-zinc-900">
                        <span className="mr-2 text-[10px] font-semibold uppercase text-zinc-400 sm:hidden">
                          {t('pricing.billingAmount')}
                        </span>
                        {formatDepositAmount(item.amount, item.currency)}
                      </span>
                      <span>
                        <StatusBadge status={item.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
