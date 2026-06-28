import { useTranslation } from 'react-i18next';
import HeaderRightSection from './HeaderRightSection';
import Logo from './Logo';

interface HeaderProps {
  credits: number;
  creditsLoading?: boolean;
  onCreditsClick?: () => void;
  onSignInClick?: () => void;
}

export default function Header({ credits, creditsLoading = false, onCreditsClick, onSignInClick }: HeaderProps) {
  const { t } = useTranslation();

  return (
    <header className="safe-area-top fixed top-0 left-0 right-0 z-40 w-full shrink-0 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[100vw] items-center justify-between gap-4 px-4 sm:px-6 md:px-8 xl:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <Logo className="h-9 w-9 shrink-0 shadow-sm" />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
              SnapFeed.ai
            </h1>
            <p className="hidden truncate text-xs text-slate-500 sm:block">
              {t('header.subtitle')}
            </p>
          </div>
        </div>

        <HeaderRightSection
          credits={credits}
          creditsLoading={creditsLoading}
          onCreditsClick={onCreditsClick}
          onSignInClick={onSignInClick}
        />
      </div>
    </header>
  );
}
