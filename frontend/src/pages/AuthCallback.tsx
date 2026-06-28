import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { POST_AUTH_MODAL_KEY } from '../constants/authFlow';
import { getSupabaseClient } from '../lib/supabase';
import Spinner from '../components/Spinner';

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

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;

      if (session) {
        sessionStorage.setItem(POST_AUTH_MODAL_KEY, '1');
        navigate('/', { replace: true });
        return;
      }

      navigate('/login', { replace: true });
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'SIGNED_IN' && session) {
        sessionStorage.setItem(POST_AUTH_MODAL_KEY, '1');
        navigate('/', { replace: true });
      }

      if (event === 'SIGNED_OUT') {
        navigate('/login', { replace: true });
      }
    });

    return () => {
      active = false;
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
