import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/Spinner';
import Logo from '../components/Logo';

export default function LoginPage() {
  const { t } = useTranslation();
  const { authEnabled, user, loading, signInWithGoogle } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError(null);

    try {
      await signInWithGoogle();
    } catch {
      setError(t('auth.signInFailed'));
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-slate-50/75 p-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <p className="mb-6 text-sm text-slate-600">{t('auth.alreadySignedIn')}</p>
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            {t('auth.backToApp')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-white px-4 py-10 text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-16 -top-16 h-[280px] w-[280px] rounded-full bg-indigo-200/30 blur-[100px]" />
        <div className="absolute -bottom-20 -left-16 h-[260px] w-[260px] rounded-full bg-purple-200/20 blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col gap-8">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-3">
            <Logo className="h-11 w-11 shadow-md" />
            <div className="text-left">
              <p className="text-xl font-bold tracking-tight">SnapFeed.ai</p>
              <p className="text-sm text-slate-500">{t('header.subtitle')}</p>
            </div>
          </Link>
        </div>

        <div className="rounded-2xl border border-white/70 bg-slate-50/75 p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md">
          <h1 className="mb-2 text-2xl font-extrabold tracking-tight">{t('auth.loginTitle')}</h1>
          <p className="mb-8 text-sm text-slate-500">{t('auth.loginDescription')}</p>

          {!authEnabled && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {t('auth.notConfigured')}
            </div>
          )}

          {error && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={!authEnabled || submitting}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Spinner /> : (
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            {t('auth.signInWithGoogle')}
          </button>

          <p className="mt-6 text-center text-xs text-slate-400">
            {t('auth.loginHintPrefix')}{' '}
            <Link to="/terms" className="font-medium text-slate-600 underline-offset-2 hover:underline">
              {t('auth.termsLink')}
            </Link>
            {' '}{t('auth.loginHintAnd')}{' '}
            <Link to="/privacy" className="font-medium text-slate-600 underline-offset-2 hover:underline">
              {t('auth.privacyLink')}
            </Link>
            .
          </p>
        </div>

        <p className="text-center text-sm text-slate-500">
          <Link to="/" className="font-medium text-slate-700 underline-offset-2 hover:underline">
            {t('auth.backToApp')}
          </Link>
        </p>
      </div>
    </div>
  );
}
