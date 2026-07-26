import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';

const linkClass =
  'inline-flex min-h-11 items-center px-1 text-[13px] text-zinc-500 transition-colors hover:text-zinc-900';

function Dot() {
  return (
    <span className="mx-1.5 select-none text-zinc-300 sm:mx-2" aria-hidden="true">
      ·
    </span>
  );
}

export default function SiteFooter() {
  const { t } = useTranslation();

  const companyLinks = [
    { to: '/about', label: t('legal.footer.about') },
    { to: '/contact', label: t('legal.footer.contact') },
  ];

  const legalLinks = [
    { to: '/terms', label: t('legal.footer.terms') },
    { to: '/privacy', label: t('legal.footer.privacy') },
    { to: '/privacy#privacy-rights', label: t('legal.footer.rights') },
    { to: '/cookies', label: t('legal.footer.cookies') },
    { to: '/refund', label: t('legal.footer.refunds') },
  ];

  return (
    <footer className="relative z-[1] mt-auto shrink-0 border-t border-zinc-200/70 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-14">
        <p className="font-display text-lg tracking-tight text-zinc-900">{COMPANY.brand}</p>

        <nav
          aria-label={t('legal.footer.company')}
          className="mt-6 flex w-full max-w-lg flex-wrap items-center justify-center gap-y-0.5 sm:mt-7 sm:max-w-none"
        >
          {companyLinks.map((item, index) => (
            <span key={item.to} className="inline-flex items-center">
              {index > 0 ? <Dot /> : null}
              <Link to={item.to} className={linkClass}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>

        <nav
          aria-label={t('legal.footer.legal')}
          className="mt-2 flex w-full max-w-lg flex-wrap items-center justify-center gap-y-0.5 sm:mt-3 sm:max-w-none"
        >
          {legalLinks.map((item, index) => (
            <span key={item.to} className="inline-flex items-center">
              {index > 0 ? <Dot /> : null}
              <Link to={item.to} className={linkClass}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>

        <div className="mt-8 h-px w-12 bg-zinc-200 sm:mt-9" aria-hidden="true" />

        <div className="mt-5 max-w-sm space-y-1 px-1 text-[11px] leading-relaxed text-zinc-400 sm:mt-6">
          <p>
            {t('legal.footer.copyright', {
              year: COMPANY.copyrightYear,
              legalName: COMPANY.legalName,
              jurisdiction: COMPANY.jurisdiction,
            })}
          </p>
          <p className="break-words">{COMPANY_FULL_ADDRESS}</p>
        </div>
      </div>
    </footer>
  );
}
