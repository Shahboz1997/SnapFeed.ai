import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSections } from '../components/LegalPageLayout';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';
import { getLegalSections } from '../utils/legalSections';

export default function AboutPage() {
  const { t } = useTranslation();
  const sections = getLegalSections(t, 'legal.about.sections');

  return (
    <LegalPageLayout title={t('legal.about.title')} lastUpdated={t('legal.about.updated')}>
      <p>
        {t('legal.about.intro', {
          brand: COMPANY.brand,
          legalName: COMPANY.legalName,
        })}
      </p>
      <LegalSections sections={sections} />
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.about.entityTitle')}
        </h2>
        <p>
          {COMPANY.legalName}
          <br />
          {t('legal.about.registeredIn', { jurisdiction: COMPANY.jurisdiction })}
          <br />
          {COMPANY_FULL_ADDRESS}
        </p>
      </section>
    </LegalPageLayout>
  );
}
