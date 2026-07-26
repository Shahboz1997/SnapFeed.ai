import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSections } from '../components/LegalPageLayout';
import { COMPANY } from '../constants/company';
import { getLegalSections } from '../utils/legalSections';
import { getSupportEmail } from '../utils/supportContact';

export default function CookiesPage() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();
  const sections = getLegalSections(t, 'legal.cookies.sections');

  return (
    <LegalPageLayout
      title={t('legal.cookies.title')}
      lastUpdated={t('legal.cookies.updated')}
    >
      <p>{t('legal.cookies.intro', { brand: COMPANY.brand })}</p>
      <LegalSections sections={sections} />
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.cookies.contactTitle')}
        </h2>
        <p>
          {t('legal.cookies.contactBody')}{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {supportEmail}
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
