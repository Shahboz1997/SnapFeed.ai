import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  COOKIE_CONSENT_KEY,
  getCookieConsent,
  type CookieConsentValue,
} from '../constants/company';

function writeConsent(value: CookieConsentValue) {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    /* ignore */
  }
}

export default function CookieConsent() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const onStudio = pathname === '/studio';
  // AppShell mobile tab bar only on these routes.
  const hasMobileTabBar =
    pathname === '/' ||
    pathname === '/studio' ||
    pathname === '/gallery' ||
    pathname === '/cabinet';

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  function choose(value: CookieConsentValue) {
    writeConsent(value);
    setVisible(false);
  }

  if (!visible) return null;

  const bottomClass = onStudio
    ? // Phones: above fixed dock + tab. From sm dock is in-flow — only clear tab bar.
      'bottom-[calc(var(--tab-bar-height)+var(--studio-dock-height)+env(safe-area-inset-bottom,0px))] pb-3 sm:bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom,0px))] lg:bottom-0 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
    : hasMobileTabBar
      ? 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px)+var(--tab-bar-height))] lg:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
      : 'bottom-0 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]';

  return (
    <div
      className={`fixed inset-x-0 z-[80] px-3 sm:px-4 ${bottomClass}`}
      role="dialog"
      aria-label={t('legal.cookieBanner.title')}
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-lg shadow-zinc-900/5 backdrop-blur-md sm:flex-row sm:items-end sm:gap-6 sm:p-5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm font-semibold text-zinc-900">{t('legal.cookieBanner.title')}</p>
          <p className="text-xs leading-relaxed text-zinc-500 sm:text-sm">
            {t('legal.cookieBanner.body')}{' '}
            <Link
              to="/cookies"
              className="font-medium text-zinc-800 underline-offset-2 hover:underline"
            >
              {t('legal.cookieBanner.learnMore')}
            </Link>
            .
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => choose('essential')}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
          >
            {t('legal.cookieBanner.essential')}
          </button>
          <button
            type="button"
            onClick={() => choose('accepted')}
            className="h-10 rounded-xl bg-zinc-900 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            {t('legal.cookieBanner.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
