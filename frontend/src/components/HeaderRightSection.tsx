import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogOut, Zap } from 'lucide-react';
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
  variant?: 'light' | 'dark';
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
      <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" fill="currentColor" aria-hidden="true" />
      <span
        className={`min-w-[1ch] tabular-nums ${loading ? 'animate-pulse opacity-80' : ''}`}
        aria-label={loading ? t('auth.creditsLabel') : undefined}
      >
        {showPlaceholder ? '…' : credits}
      </span>
    </>
  );

  const className = `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-2.5 text-xs font-bold text-zinc-800 shadow-sm shadow-zinc-200/50 transition hover:border-zinc-300 hover:shadow-md hover:shadow-zinc-200/60 sm:px-3 ${
    isEmpty ? 'cursor-pointer ring-1 ring-amber-300/60' : ''
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
    <Link to="/cabinet" title={t('auth.creditsLabel')} className={className}>
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
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
        <CreditsPill credits={credits} isGuest={!user} loading={creditsLoading} onClick={onCreditsClick} />
        <LanguageSwitcher variant="light" />
        <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-zinc-200" aria-hidden="true" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-9 min-w-0 shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
        <CreditsPill credits={credits} isGuest loading={creditsLoading} onClick={onCreditsClick} />
        <LanguageSwitcher variant="light" />
        <button
          type="button"
          onClick={onSignInClick}
          className="inline-flex h-9 shrink-0 items-center rounded-xl border border-zinc-200/80 bg-white px-2.5 text-xs font-semibold text-zinc-700 shadow-sm shadow-zinc-200/40 transition hover:border-zinc-300 hover:bg-zinc-50 sm:px-4 sm:text-sm"
        >
          {t('auth.signIn')}
        </button>
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
    <div className="flex h-9 min-w-0 shrink-0 items-center gap-1.5 sm:gap-2 lg:gap-3">
      <CreditsPill credits={credits} loading={creditsLoading} onClick={onCreditsClick} />
      <LanguageSwitcher variant="light" />

      <div ref={dropdownRef} className="relative">
        <button
          type="button"
          onClick={() => setIsProfileOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={isProfileOpen}
          aria-label={displayName}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white shadow-sm shadow-zinc-300/50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40"
        >
          {getInitials(displayName)}
        </button>

        {isProfileOpen && (
          <div
            role="menu"
            className="absolute right-0 top-11 z-50 w-52 origin-top-right rounded-xl border border-zinc-200/70 bg-white/95 p-1.5 shadow-xl shadow-zinc-200/70 backdrop-blur-xl"
          >
            <div className="px-3 py-2 text-left">
              <p className="truncate text-xs font-semibold text-zinc-900">{displayName}</p>
              {email && <p className="truncate text-[10px] text-zinc-500">{email}</p>}
            </div>

            <div className="my-1 border-b border-zinc-100" />

            <Link
              to="/cabinet"
              role="menuitem"
              onClick={() => setIsProfileOpen(false)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-900"
            >
              {t('auth.cabinetTitle')}
            </Link>

            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>{t('auth.signOut')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
