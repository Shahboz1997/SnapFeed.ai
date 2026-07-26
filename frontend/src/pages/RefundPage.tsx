import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LegalPageLayout, { LegalSections } from '../components/LegalPageLayout';
import { COMPANY } from '../constants/company';
import { getLegalSections } from '../utils/legalSections';
import { getSupportEmail } from '../utils/supportContact';

export default function RefundPage() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();
  const sections = getLegalSections(t, 'legal.refund.sections');

  return (
    <LegalPageLayout
      title={t('legal.refund.title')}
      lastUpdated={t('legal.refund.updated')}
    >
      <p>{t('legal.refund.intro', { brand: COMPANY.brand })}</p>
      <LegalSections sections={sections} />
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-slate-900">
          {t('legal.refund.contactTitle')}
        </h2>
        <p>
          {t('legal.refund.contactBody')}{' '}
          <a
            href={`mailto:${supportEmail}`}
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {supportEmail}
          </a>
          . {t('legal.refund.seeAlso')}{' '}
          <Link
            to="/terms"
            className="font-medium text-slate-900 underline-offset-2 hover:underline"
          >
            {t('legal.footer.terms')}
          </Link>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
