import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Header from '../components/Header';
import Logo from '../components/Logo';
import { getSupportEmail } from '../utils/supportContact';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();

  return (
    <div className="min-h-[100dvh] bg-white text-slate-900">
      <Header credits={0} />

      <main className="mx-auto max-w-2xl px-4 pt-24 pb-12 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <Logo className="h-9 w-9 shadow-sm" />
          <h1 className="text-2xl font-extrabold tracking-tight">{t('legal.privacyTitle')}</h1>
        </div>

        <div className="prose prose-slate max-w-none space-y-4 text-sm leading-relaxed text-slate-600">
          <p>{t('legal.privacyIntro')}</p>
          <h2 className="text-base font-semibold text-slate-900">{t('legal.privacyDataTitle')}</h2>
          <p>{t('legal.privacyDataBody')}</p>
          <h2 className="text-base font-semibold text-slate-900">{t('legal.privacyGuestTitle')}</h2>
          <p>{t('legal.privacyGuestBody')}</p>
          <h2 className="text-base font-semibold text-slate-900">{t('legal.privacyContactTitle')}</h2>
          <p>
            {t('legal.privacyContactBody')}{' '}
            <a
              href={`mailto:${supportEmail}`}
              className="font-medium text-slate-900 underline-offset-2 hover:underline"
            >
              {supportEmail}
            </a>
            .
          </p>
        </div>

        <p className="mt-8">
          <Link to="/" className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
            ← {t('auth.backToApp')}
          </Link>
        </p>
      </main>
    </div>
  );
}
