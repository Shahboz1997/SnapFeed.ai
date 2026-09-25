import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { COMPANY, COMPANY_FULL_ADDRESS } from '../constants/company';
import { getSupportEmail } from '../utils/supportContact';

const linkClass =
  'text-[13px] text-zinc-500 transition-colors hover:text-zinc-900';

export default function SiteFooter() {
  const { t } = useTranslation();
  const supportEmail = getSupportEmail();

  const companyLinks = [
    { to: '/about', label: t('legal.footer.about') },
    { to: '/contact', label: t('legal.footer.contact') },
  ];

  const legalLinks = [
    { to: '/terms', label: t('legal.footer.terms') },
    { to: '/privacy', label: t('legal.footer.privacy') },
    { to: '/refund', label: t('legal.footer.refunds') },
    { to: '/cookies', label: t('legal.footer.cookies') },
    { to: '/privacy#privacy-rights', label: t('legal.footer.rights') },
  ];

  return (
    <footer className="relative z-[1] mt-auto shrink-0 border-t border-zinc-200/70 bg-gradient-to-b from-white to-zinc-50/80">
      <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="rounded-[1.35rem] border border-zinc-200/70 bg-white/90 p-6 shadow-[0_16px_40px_-32px_rgba(24,24,27,0.45)] sm:rounded-[1.75rem] sm:p-8">
          <div className="grid gap-8 sm:grid-cols-[1.2fr_1fr_1fr] sm:gap-6 lg:gap-10">
            <div className="text-center sm:text-left">
              <a
                href={COMPANY.siteUrl}
                className="font-display text-xl tracking-tight text-zinc-900 transition-colors hover:text-zinc-600"
              >
                {COMPANY.brand}
              </a>
              <a
                href={COMPANY.siteUrl}
                className="mt-1 block text-[13px] text-zinc-400 transition-colors hover:text-zinc-700"
              >
                snapfeed.help
              </a>
                  <p className="mx-auto mt-4 max-w-xs text-sm leading-relaxed text-zinc-500 sm:mx-0">
                    {t('legal.footer.tagline')}
                  </p>
              <a
                href={`mailto:${supportEmail}`}
                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white transition hover:bg-zinc-800"
              >
                {supportEmail}
              </a>
            </div>

            <nav aria-label={t('legal.footer.company')} className="text-center sm:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                {t('legal.footer.company')}
              </p>
              <ul className="mt-3 space-y-2.5">
                {companyLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className={linkClass}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <nav aria-label={t('legal.footer.legal')} className="text-center sm:text-left">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
                {t('legal.footer.legal')}
              </p>
              <ul className="mt-3 space-y-2.5">
                {legalLinks.map((item) => (
                  <li key={item.to}>
                    <Link to={item.to} className={linkClass}>
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          <div className="mt-8 border-t border-zinc-100 pt-5 text-center sm:mt-9 sm:flex sm:items-start sm:justify-between sm:gap-6 sm:text-left">
            <div className="space-y-1 text-[11px] leading-relaxed text-zinc-400">
              <p>
                {t('legal.footer.copyright', {
                  year: COMPANY.copyrightYear,
                  brand: COMPANY.brand,
                })}
              </p>
              <p>{t('legal.footer.operatedBy', { legalName: COMPANY.legalName })}</p>
            </div>
            <p className="mt-3 break-words text-[11px] leading-relaxed text-zinc-400 sm:mt-0 sm:max-w-xs sm:text-right">
              {COMPANY_FULL_ADDRESS}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
