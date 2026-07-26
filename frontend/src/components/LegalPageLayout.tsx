import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchGuestCredits } from '../api/guestCredits';
import {
  GUEST_CREDITS_INITIAL,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from '../constants/guestCredits';
import { useAuth } from '../context/AuthContext';
import Header from './Header';
import LoginModal from './LoginModal';
import Logo from './Logo';
import PricingModal from './PricingModal';
import SiteFooter from './SiteFooter';

type LegalPageLayoutProps = {
  title: string;
  children: ReactNode;
  lastUpdated?: string;
};

export default function LegalPageLayout({
  title,
  children,
  lastUpdated,
}: LegalPageLayoutProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [guestCredits, setGuestCredits] = useState<number | null>(() =>
    readGuestCreditsFromStorage(),
  );
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(
    () => !user && readGuestCreditsFromStorage() === null,
  );
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const displayCredits = user ? (profile?.credits ?? 0) : (guestCredits ?? 0);
  const creditsLoading = user ? authLoading || profile === null : guestCreditsLoading;

  useEffect(() => {
    if (user) return;
    let cancelled = false;

    async function syncGuestCredits() {
      const cached = readGuestCreditsFromStorage();
      if (cached === null) setGuestCreditsLoading(true);
      const serverCredits = await fetchGuestCredits();
      if (cancelled) return;
      setGuestCreditsLoading(false);
      if (typeof serverCredits === 'number') {
        setGuestCredits(serverCredits);
        writeGuestCreditsToStorage(serverCredits);
        return;
      }
      setGuestCredits(cached ?? GUEST_CREDITS_INITIAL);
    }

    syncGuestCredits();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function openCreditsFlow() {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setShowPricingModal(true);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-y-auto overscroll-y-contain bg-white text-slate-900">
      <Header
        credits={displayCredits}
        creditsLoading={creditsLoading}
        onCreditsClick={openCreditsFlow}
        onSignInClick={() => setShowLoginModal(true)}
      />

      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PricingModal
        open={showPricingModal}
        onClose={() => setShowPricingModal(false)}
        credits={displayCredits}
      />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-24 pb-12 sm:px-6">
        <div className="mb-8 flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="shrink-0"
            aria-label="SnapFeed.ai"
          >
            <Logo className="h-9 w-9 shadow-sm" />
          </button>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
            {lastUpdated ? (
              <p className="mt-1 text-xs text-slate-400">
                {t('legal.lastUpdated', { date: lastUpdated })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="prose prose-slate max-w-none space-y-5 text-sm leading-relaxed text-slate-600">
          {children}
        </div>

        <p className="mt-10">
          <Link
            to="/"
            className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
          >
            ← {t('auth.backToApp')}
          </Link>
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}

export type LegalSection = {
  id?: string;
  title: string;
  body: string;
};

export function LegalSections({ sections }: { sections: LegalSection[] }) {
  return (
    <>
      {sections.map((section) => (
        <section key={section.title} id={section.id} className="scroll-mt-28 space-y-2">
          <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
          <p className="whitespace-pre-line">{section.body}</p>
        </section>
      ))}
    </>
  );
}
