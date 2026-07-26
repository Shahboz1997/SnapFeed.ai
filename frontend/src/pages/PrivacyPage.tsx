import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSections } from '../components/LegalPageLayout';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';
import { getLegalSections } from '../utils/legalSections';
import { getSupportEmail } from '../utils/supportContact';

export default function PrivacyPage() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();
  const sections = getLegalSections(t, 'legal.privacy.sections');

  return (
    <LegalPageLayout
      title={t('legal.privacy.title')}
      lastUpdated={t('legal.privacy.updated')}
    >
      <p>
        {t('legal.privacy.intro', {
          brand: COMPANY.brand,
          legalName: COMPANY.legalName,
        })}
      </p>
      <LegalSections sections={sections} />
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.privacy.contactTitle')}
        </h2>
        <p>
          {t('legal.privacy.contactBody')}{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {supportEmail}
          </a>
          .
        </p>
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY_FULL_ADDRESS}
        </p>
      </section>
    </LegalPageLayout>
  );
}
