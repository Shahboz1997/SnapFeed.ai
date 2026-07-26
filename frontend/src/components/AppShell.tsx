import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { Home, Images, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';
import HeaderRightSection from './HeaderRightSection';
import Logo from './Logo';
import SiteFooter from './SiteFooter';

type AppShellProps = {
  children: ReactNode;
  credits: number;
  creditsLoading?: boolean;
  onCreditsClick?: () => void;
  onSignInClick?: () => void;
  variant?: 'light' | 'studio';
};

const sideNavClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
    isActive
      ? 'text-zinc-900'
      : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700'
  }`;

const tabNavClass = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-[44px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 pt-1 text-[10px] font-semibold tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
    isActive ? 'text-zinc-900' : 'text-zinc-400 active:text-zinc-600'
  }`;

export default function AppShell({
  children,
  credits,
  creditsLoading = false,
  onCreditsClick,
  onSignInClick,
}: AppShellProps) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Studio uses a fixed mobile dock that would cover the footer.
  const showFooter = pathname !== '/studio';

  return (
    <div className="relative flex h-dvh max-h-dvh overflow-hidden bg-zinc-50 text-zinc-900">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -left-24 top-0 h-[420px] w-[420px] rounded-full bg-indigo-200/25 blur-[120px]" />
        <div className="absolute right-0 top-24 h-[380px] w-[380px] rounded-full bg-violet-200/20 blur-[130px]" />
        <div className="absolute bottom-0 left-1/3 h-[320px] w-[320px] rounded-full bg-zinc-200/40 blur-[100px]" />
      </div>

      {/* Desktop / tablet sidebar — hidden on phones */}
      <aside className="safe-area-top fixed inset-y-0 left-0 z-40 hidden w-16 flex-col items-center border-r border-zinc-200/70 bg-white/80 py-4 backdrop-blur-xl lg:flex">
        <NavLink to="/" className="mb-6" aria-label="SnapFeed.ai">
          <Logo className="h-9 w-9 shadow-md shadow-zinc-200/60" />
        </NavLink>

        <nav className="flex flex-1 flex-col items-center gap-2" aria-label={t('nav.label')}>
          <NavLink to="/" end className={sideNavClass} title={t('nav.home')} aria-label={t('nav.home')}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-nav-active"
                    className="absolute inset-0 rounded-xl bg-white shadow-sm shadow-zinc-200/80 ring-1 ring-zinc-200/80"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Home className="relative z-10 h-5 w-5" strokeWidth={1.5} />
              </>
            )}
          </NavLink>
          <NavLink to="/studio" className={sideNavClass} title={t('nav.studio')} aria-label={t('nav.studio')}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-nav-active"
                    className="absolute inset-0 rounded-xl bg-white shadow-sm shadow-zinc-200/80 ring-1 ring-zinc-200/80"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Sparkles className="relative z-10 h-5 w-5" strokeWidth={1.5} />
              </>
            )}
          </NavLink>
          <NavLink to="/gallery" className={sideNavClass} title={t('nav.gallery')} aria-label={t('nav.gallery')}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-nav-active"
                    className="absolute inset-0 rounded-xl bg-white shadow-sm shadow-zinc-200/80 ring-1 ring-zinc-200/80"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Images className="relative z-10 h-5 w-5" strokeWidth={1.5} />
              </>
            )}
          </NavLink>
          <NavLink
            to="/cabinet"
            className={sideNavClass}
            title={t('auth.cabinetTitle')}
            aria-label={t('auth.cabinetTitle')}
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-nav-active"
                    className="absolute inset-0 rounded-xl bg-white shadow-sm shadow-zinc-200/80 ring-1 ring-zinc-200/80"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <UserRound className="relative z-10 h-5 w-5" strokeWidth={1.5} />
              </>
            )}
          </NavLink>
        </nav>
      </aside>

      <div className="relative z-10 flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden lg:pl-16">
        <header
          className="z-50 shrink-0 border-b border-zinc-200/60 bg-white/80 backdrop-blur-md"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="safe-area-x flex h-14 items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 lg:gap-4 lg:px-6">
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-base tracking-tight text-zinc-900 sm:text-lg">
                {t('header.productName')}
              </h1>
            </div>

            <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
              <button
                type="button"
                onClick={onCreditsClick}
                className="hidden h-9 items-center rounded-xl bg-zinc-900 px-3 text-xs font-semibold text-white shadow-sm shadow-zinc-300/50 transition hover:bg-zinc-800 lg:inline-flex"
              >
                {t('pricing.upgrade')}
              </button>
              <HeaderRightSection
                credits={credits}
                creditsLoading={creditsLoading}
                onCreditsClick={onCreditsClick}
                onSignInClick={onSignInClick}
                variant="light"
              />
            </div>
          </div>
        </header>

        <div className="mobile-tab-offset min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
          {/*
            With footer: let page content grow so this scroller can scroll.
            min-h-0 + flex-1 on the content wrapper would clamp height to the
            viewport and clip overflow (footer unreachable / no scroll).
            Studio (no footer): fill the shell and manage overflow internally.
          */}
          <div className={`flex flex-col ${showFooter ? 'min-h-full' : 'h-full min-h-0'}`}>
            <div className={showFooter ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col'}>
              {children}
            </div>
            {showFooter ? <SiteFooter /> : null}
          </div>
        </div>
      </div>

      {/* iOS-style bottom tab bar — phones / small tablets */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-200/80 bg-white/90 backdrop-blur-md lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        aria-label={t('nav.label')}
      >
        <div className="mx-auto flex h-[3.75rem] max-w-lg items-stretch">
          <NavLink to="/" end className={tabNavClass}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-tab-active"
                    className="absolute inset-x-3 top-1 h-8 rounded-xl bg-zinc-100"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Home className="relative z-10 h-[22px] w-[22px]" strokeWidth={isActive ? 2 : 1.5} />
                <span className="relative z-10 truncate">{t('nav.home')}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/studio" className={tabNavClass}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-tab-active"
                    className="absolute inset-x-3 top-1 h-8 rounded-xl bg-zinc-100"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Sparkles className="relative z-10 h-[22px] w-[22px]" strokeWidth={isActive ? 2 : 1.5} />
                <span className="relative z-10 truncate">{t('nav.studio')}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/gallery" className={tabNavClass}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-tab-active"
                    className="absolute inset-x-3 top-1 h-8 rounded-xl bg-zinc-100"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <Images className="relative z-10 h-[22px] w-[22px]" strokeWidth={isActive ? 2 : 1.5} />
                <span className="relative z-10 truncate">{t('nav.gallery')}</span>
              </>
            )}
          </NavLink>
          <NavLink to="/cabinet" className={tabNavClass}>
            {({ isActive }) => (
              <>
                {isActive ? (
                  <motion.span
                    layoutId="shell-tab-active"
                    className="absolute inset-x-3 top-1 h-8 rounded-xl bg-zinc-100"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                ) : null}
                <UserRound className="relative z-10 h-[22px] w-[22px]" strokeWidth={isActive ? 2 : 1.5} />
                <span className="relative z-10 truncate">{t('auth.cabinetTitle')}</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  );
}
