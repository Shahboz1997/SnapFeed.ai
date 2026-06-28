import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import LanguageSwitcher from './LanguageSwitcher';

function getInitials(name: string): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

interface HeaderRightSectionProps {
  credits: number;
  creditsLoading?: boolean;
  onCreditsClick?: () => void;
  onSignInClick?: () => void;
}

function CreditsPill({
  credits,
  isGuest,
  loading,
  onClick,
}: {
  credits: number;
  isGuest?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation();
  const isEmpty = credits <= 0;
  const showPlaceholder = loading && credits <= 0;

  const pill = (
    <>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-3.5 w-3.5 shrink-0 text-amber-500"
        aria-hidden="true"
      >
        <path d="M12 2L3.5 13H11V22L19.5 11H12V2Z" />
      </svg>
      <span
        className={`min-w-[1ch] tabular-nums ${loading ? 'animate-pulse opacity-80' : ''}`}
        aria-label={loading ? t('auth.creditsLabel') : undefined}
      >
        {showPlaceholder ? '…' : credits}
      </span>
    </>
  );

  const className = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-200/60 bg-amber-50 px-2.5 text-xs font-bold text-amber-700 shadow-sm transition hover:scale-105 sm:px-3 ${
    isEmpty ? 'cursor-pointer ring-2 ring-amber-300/50' : ''
  }`;

  if (isEmpty && onClick) {
    return (
      <button
        type="button"
        title={t('auth.creditsLabel')}
        onClick={onClick}
        disabled={loading}
        className={className}
      >
        {pill}
      </button>
    );
  }

  if (isGuest) {
    return (
      <span title={t('auth.creditsLabel')} className={className}>
        {pill}
      </span>
    );
  }

  return (
    <Link
      to="/cabinet"
      title={t('auth.creditsLabel')}
      className={className}
    >
      {pill}
    </Link>
  );
}

export default function HeaderRightSection({
  credits,
  creditsLoading = false,
  onCreditsClick,
  onSignInClick,
}: HeaderRightSectionProps) {
  const { t } = useTranslation();
  const { authEnabled, user, profile, loading, signOut } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (authEnabled && loading) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 sm:gap-3">
        <CreditsPill credits={credits} isGuest={!user} loading={creditsLoading} onClick={onCreditsClick} />
        <LanguageSwitcher />
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-200/70" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-2 sm:gap-3">
        <CreditsPill credits={credits} isGuest loading={creditsLoading} onClick={onCreditsClick} />
        <LanguageSwitcher />
        {authEnabled && (
          <button
            type="button"
            onClick={onSignInClick}
            className="inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:px-4 sm:text-sm"
          >
            {t('auth.signIn')}
          </button>
        )}
      </div>
    );
  }

  const displayName = profile?.full_name || user.user_metadata?.full_name || user.email || t('auth.guest');
  const email = profile?.email || user.email || '';

  async function handleSignOut() {
    setIsProfileOpen(false);
    await signOut();
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-2 sm:gap-3">
      <CreditsPill credits={credits} loading={creditsLoading} onClick={onCreditsClick} />

      <LanguageSwitcher />

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isProfileOpen}
          aria-label={displayName}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
        >
          {getInitials(displayName)}
        </button>

        {isProfileOpen && (
          <div
            role="menu"
            className="absolute right-0 top-11 z-50 w-48 origin-top-right transform rounded-xl border border-slate-200/60 bg-white p-1.5 shadow-xl transition-all animate-in fade-in slide-in-from-top-2 duration-150"
          >
            <div className="px-3 py-2 text-left">
              <p className="truncate text-xs font-semibold text-slate-800">
                {displayName}
              </p>
              {email && (
                <p className="truncate text-[10px] text-slate-400">
                  {email}
                </p>
              )}
            </div>

            <div className="my-1 border-b border-slate-100" />

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                />
              </svg>
              <span>{t('auth.signOut')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
