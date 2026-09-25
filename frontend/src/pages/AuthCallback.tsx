import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { POST_AUTH_FIRST_SUCCESS_KEY } from '../constants/authFlow';
import { getSupabaseClient } from '../lib/supabase';
import Spinner from '../components/Spinner';

const AUTH_CALLBACK_TIMEOUT_MS = 12_000;

export default function AuthCallback() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const supabase = getSupabaseClient();

  useEffect(() => {
    if (!supabase) {
      navigate('/login', { replace: true });
      return;
    }

    let active = true;
    let settled = false;

    function goToFirstSuccess() {
      if (!active || settled) return;
      settled = true;
      sessionStorage.setItem(POST_AUTH_FIRST_SUCCESS_KEY, '1');
      navigate('/studio', { replace: true });
    }

    function goToLogin() {
      if (!active || settled) return;
      settled = true;
      navigate('/login', { replace: true });
    }

    // Wait for PKCE exchange / SIGNED_IN — do not bounce to /login on the first empty getSession().
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        goToFirstSuccess();
      }

      if (event === 'SIGNED_OUT') {
        goToLogin();
      }
    });

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (session) {
        goToFirstSuccess();
      }
      // If empty, keep waiting for onAuthStateChange / timeout — code exchange may still be in flight.
    });

    const timeoutId = window.setTimeout(() => {
      if (!active || settled) return;
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!active || settled) return;
        if (session) {
          goToFirstSuccess();
        } else {
          goToLogin();
        }
      });
    }, AUTH_CALLBACK_TIMEOUT_MS);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [navigate, supabase]);

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-white px-4">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner />
        <p className="text-sm text-slate-500">{t('auth.signingIn')}</p>
      </div>
    </div>
  );
}
