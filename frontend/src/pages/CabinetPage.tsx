import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import { buildCreditPurchaseMailto } from '../utils/supportContact';

export default function CabinetPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authEnabled, user, profile, loading, signOut, refreshProfile } = useAuth();

  useEffect(() => {
    if (!loading && authEnabled && !user) {
      navigate('/login', { replace: true });
    }
  }, [authEnabled, loading, navigate, user]);

  useEffect(() => {
    if (user) {
      refreshProfile();
    }
  }, [refreshProfile, user]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (authEnabled && !user) {
    return null;
  }

  const displayName = profile?.full_name || user?.email || t('auth.guest');
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const starterTierLabel = t('pricing.creditsPack', { count: 10 });
  const contactMailto = buildCreditPurchaseMailto({
    subject: t('pricing.mailSubject', { tier: starterTierLabel }),
    body: t('pricing.mailBody', {
      tier: starterTierLabel,
      price: '$4.99',
      email: profile?.email || user?.email || '',
    }),
  });

  return (
    <div className="min-h-[100dvh] bg-white text-slate-900">
      <Header credits={profile?.credits ?? 0} />

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-24 pb-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            ← {t('auth.backToApp')}
          </Link>
          <button
            type="button"
            onClick={() => signOut()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            {t('auth.signOut')}
          </button>
        </div>

        <section className="rounded-2xl border border-slate-200/80 bg-slate-50/75 p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-8">
          <h1 className="mb-6 text-2xl font-extrabold tracking-tight">{t('auth.cabinetTitle')}</h1>

          <div className="mb-8 flex items-center gap-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full border border-slate-200 object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{displayName}</p>
              <p className="truncate text-sm text-slate-500">{profile?.email || user?.email}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {t('auth.creditsLabel')}
              </p>
              <p className="text-3xl font-bold tabular-nums text-slate-900">
                {profile?.credits ?? 0}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {t('auth.planLabel')}
              </p>
              <p className="text-lg font-semibold capitalize text-slate-900">
                {profile?.plan || 'free'}
              </p>
            </div>
          </div>

          <p className="mt-6 text-sm text-slate-500">{t('auth.cabinetHint')}</p>

          <div className="mt-6 rounded-xl border border-amber-200/80 bg-amber-50/60 p-5">
            <h2 className="mb-2 text-sm font-semibold text-slate-900">{t('pricing.topUpTitle')}</h2>
            <p className="mb-3 text-sm leading-relaxed text-amber-900">{t('pricing.manualPaymentNotice')}</p>
            <p className="mb-4 text-xs text-slate-500">{t('pricing.topUpDescription')}</p>
            <a
              href={contactMailto}
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              {t('pricing.contactButton')}
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
