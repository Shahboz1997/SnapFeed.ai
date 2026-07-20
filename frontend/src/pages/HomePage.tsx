import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Images, Sparkles } from 'lucide-react';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingModal from '../components/PricingModal';
import { useAuth } from '../context/AuthContext';
import { fetchGuestCredits } from '../api/guestCredits';
import { POST_AUTH_MODAL_KEY } from '../constants/authFlow';
import {
  GUEST_CREDITS_INITIAL,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from '../constants/guestCredits';

export default function HomePage() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pricingWelcome, setPricingWelcome] = useState(false);

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
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (authLoading || !user || !profile) return;
    if (sessionStorage.getItem(POST_AUTH_MODAL_KEY)) {
      sessionStorage.removeItem(POST_AUTH_MODAL_KEY);
      setPricingWelcome(true);
      setShowPricingModal(true);
    }
  }, [authLoading, user, profile]);

  function openCreditsFlow() {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setShowPricingModal(true);
  }

  return (
    <AppShell
      credits={displayCredits}
      creditsLoading={creditsLoading}
      onCreditsClick={openCreditsFlow}
      onSignInClick={() => setShowLoginModal(true)}
    >
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PricingModal
        open={showPricingModal}
        onClose={() => { setShowPricingModal(false); setPricingWelcome(false); }}
        credits={displayCredits}
        welcome={pricingWelcome}
      />

      <main className="relative mx-auto flex w-full max-w-5xl flex-col px-3 py-8 sm:px-6 sm:py-14 lg:py-20">
        <section className="mx-auto w-full max-w-3xl text-center">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-3 font-display text-xl font-semibold tracking-tight text-zinc-900 sm:mb-4 sm:text-3xl"
          >
            {t('home.eyebrow')}
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-display text-[1.85rem] leading-[1.12] tracking-tight text-zinc-900 sm:text-5xl md:text-6xl"
          >
            {t('home.title')}
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-zinc-500 sm:mt-5 sm:text-lg"
          >
            {t('home.subtitle')}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass-panel luxury-shadow mx-auto mt-6 flex w-full max-w-xl flex-col gap-2.5 rounded-2xl p-2.5 sm:mt-8 sm:gap-3 sm:rounded-3xl sm:p-3 md:flex-row md:items-center"
          >
            <div className="min-w-0 flex-1 px-2.5 py-2 text-center md:px-3 md:text-left">
              <p className="text-sm leading-snug text-zinc-500 sm:text-[0.9375rem]">
                {t('home.promptHint')}
              </p>
            </div>
            <Link
              to="/studio"
              className="relative inline-flex h-12 w-full shrink-0 items-center justify-center gap-2 overflow-hidden rounded-2xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 md:w-auto md:px-6"
            >
              {t('home.cta')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </motion.div>
        </section>

        <section className="mt-12 sm:mt-20 lg:mt-24">
          <h3 className="mb-5 font-display text-xl tracking-tight text-zinc-900 sm:mb-6 sm:text-3xl">
            {t('home.shortcutsTitle')}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-5">
            <Link
              to="/studio"
              className="group relative min-h-[200px] overflow-hidden rounded-2xl border border-zinc-200/70 shadow-sm shadow-zinc-200/40 transition duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-200/60 sm:min-h-[280px] sm:rounded-3xl"
            >
              <img
                src="https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-top transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/85 to-white/25" />
              <div className="relative z-10 flex h-full min-h-[200px] flex-col justify-end p-5 sm:min-h-[280px] sm:p-7">
                <span className="mb-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-zinc-800 shadow-sm backdrop-blur-sm transition group-hover:bg-zinc-900 group-hover:text-white">
                  <Sparkles className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:mt-8">
                  {t('home.tryOnBadge')}
                </p>
                <h4 className="mt-1.5 font-display text-xl tracking-tight text-zinc-900 sm:text-2xl">
                  {t('home.tryOnTitle')}
                </h4>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-600">
                  {t('home.tryOnDesc')}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 sm:mt-5">
                  {t('home.cta')}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>

            <Link
              to="/gallery"
              className="group relative min-h-[200px] overflow-hidden rounded-2xl border border-zinc-200/70 shadow-sm shadow-zinc-200/40 transition duration-300 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-xl hover:shadow-zinc-200/60 sm:min-h-[280px] sm:rounded-3xl"
            >
              <img
                src="https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-white via-white/85 to-white/25" />
              <div className="relative z-10 flex h-full min-h-[200px] flex-col justify-end p-5 sm:min-h-[280px] sm:p-7">
                <span className="mb-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/90 text-zinc-800 shadow-sm backdrop-blur-sm transition group-hover:bg-zinc-900 group-hover:text-white">
                  <Images className="h-4 w-4" strokeWidth={1.75} />
                </span>
                <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:mt-8">
                  {t('home.galleryBadge')}
                </p>
                <h4 className="mt-1.5 font-display text-xl tracking-tight text-zinc-900 sm:text-2xl">
                  {t('home.galleryTitle')}
                </h4>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-600">
                  {t('home.galleryDesc')}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 sm:mt-5">
                  {t('gallery.title')}
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
