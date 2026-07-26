import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSections } from '../components/LegalPageLayout';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';
import { getLegalSections } from '../utils/legalSections';
import { getSupportEmail } from '../utils/supportContact';

export default function ContactPage() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();
  const sections = getLegalSections(t, 'legal.contact.sections');

  return (
    <LegalPageLayout
      title={t('legal.contact.title')}
      lastUpdated={t('legal.contact.updated')}
    >
      <p>{t('legal.contact.intro', { brand: COMPANY.brand })}</p>
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.contact.emailTitle')}
        </h2>
        <p>
          <a
            href={`mailto:${supportEmail}`}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {supportEmail}
          </a>
        </p>
        <p className="text-slate-500">{t('legal.contact.responseTime')}</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.contact.mailTitle')}
        </h2>
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY_FULL_ADDRESS}
        </p>
      </section>
      <LegalSections sections={sections} />
    </LegalPageLayout>
  );
}
