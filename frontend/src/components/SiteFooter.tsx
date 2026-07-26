import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';

const linkClass =
  'text-[13px] text-zinc-500 transition-colors hover:text-zinc-900';

function Dot() {
  return <span className="select-none text-zinc-300" aria-hidden="true">·</span>;
}

export default function SiteFooter() {
  const { t } = useTranslation();

  const productLinks = [
    { to: '/', label: t('nav.home') },
    { to: '/studio', label: t('nav.studio') },
    { to: '/gallery', label: t('nav.gallery') },
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
    <footer className="relative z-[1] mt-auto border-t border-zinc-200/70 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-12 text-center sm:px-6 sm:py-16">
        <p className="font-display text-lg tracking-tight text-zinc-900">{COMPANY.brand}</p>

        <nav
          aria-label={t('legal.footer.product')}
          className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        >
          {productLinks.map((item, index) => (
            <span key={item.to} className="inline-flex items-center gap-x-3">
              {index > 0 ? <Dot /> : null}
              <Link to={item.to} className={linkClass}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>

        <nav
          aria-label={t('legal.footer.legal')}
          className="mt-3.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-2"
        >
          {legalLinks.map((item, index) => (
            <span key={item.to} className="inline-flex items-center gap-x-3">
              {index > 0 ? <Dot /> : null}
              <Link to={item.to} className={linkClass}>
                {item.label}
              </Link>
            </span>
          ))}
        </nav>

        <div className="mt-9 h-px w-12 bg-zinc-200" aria-hidden="true" />

        <div className="mt-6 max-w-sm space-y-1 text-[11px] leading-relaxed text-zinc-400">
          <p>
            {t('legal.footer.copyright', {
              year: COMPANY.copyrightYear,
              legalName: COMPANY.legalName,
              jurisdiction: COMPANY.jurisdiction,
            })}
          </p>
          <p>{COMPANY_FULL_ADDRESS}</p>
        </div>
      </div>
    </footer>
  );
}
