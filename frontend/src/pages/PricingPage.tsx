import { useEffect, useState } from 'react';
import { fetchGuestCredits } from '../api/guestCredits';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingPlans from '../components/PricingPlans';
import { useAuth } from '../context/AuthContext';
import {
  GUEST_CREDITS_INITIAL,
  mergeGuestCredits,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from '../constants/guestCredits';

export default function PricingPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
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
        const merged = mergeGuestCredits(serverCredits, cached);
        setGuestCredits(merged);
        writeGuestCreditsToStorage(merged);
        return;
      }
      setGuestCredits(cached ?? GUEST_CREDITS_INITIAL);
    }

    syncGuestCredits();
    return () => { cancelled = true; };
  }, [user]);

  return (
    <AppShell
      credits={displayCredits}
      creditsLoading={creditsLoading}
      onCreditsClick={() => {
        document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }}
      onSignInClick={() => setShowLoginModal(true)}
    >
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />

      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PricingPlans onRequireAuth={() => setShowLoginModal(true)} />
      </main>
    </AppShell>
  );
}
