import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadImageBlob, triggerBlobDownload } from '../api/downloadImage';
import { fetchGuestCredits } from '../api/guestCredits';
import AppShell from '../components/AppShell';
import LoginModal from '../components/LoginModal';
import PricingModal from '../components/PricingModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  GUEST_CREDITS_INITIAL,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from '../constants/guestCredits';
import { listGalleryItems, removeGalleryItem, type GalleryItem } from '../lib/galleryStorage';
import { resolveImageUrl } from '../utils/resolveImageUrl';

export default function GalleryPage() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const displayCredits = user ? (profile?.credits ?? 0) : (guestCredits ?? 0);
  const creditsLoading = user ? authLoading || profile === null : guestCreditsLoading;

  useEffect(() => {
    setItems(listGalleryItems());
  }, []);

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

  function openCreditsFlow() {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setShowPricingModal(true);
  }

  function handleRemove(id: string) {
    removeGalleryItem(id);
    setItems(listGalleryItems());
  }

  async function handleDownload(item: GalleryItem) {
    if (downloadingId) return;
    setDownloadingId(item.id);
    try {
      const blob = await downloadImageBlob(item.imageUrl);
      triggerBlobDownload(blob, `snapfeed-gallery-${item.id}.png`);
      showToast(t('alerts.downloadSuccess'), 'success');
    } catch {
      showToast(t('alerts.downloadWarning'), 'error');
    } finally {
      setDownloadingId(null);
    }
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
        onClose={() => setShowPricingModal(false)}
        credits={displayCredits}
      />

      <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-6 sm:py-8 lg:py-10">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
              {t('gallery.eyebrow')}
            </p>
            <h2 className="mt-2 font-display text-2xl text-zinc-900 sm:text-4xl">
              {t('gallery.title')}
            </h2>
          </div>
          <Link
            to="/studio"
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
          >
            {t('gallery.newTryOn')}
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="glass-panel luxury-shadow flex min-h-[280px] flex-col items-center justify-center rounded-2xl border-dashed px-4 text-center sm:min-h-[420px] sm:rounded-3xl sm:px-6">
            <p className="font-display text-xl text-zinc-900 sm:text-2xl">{t('gallery.emptyTitle')}</p>
            <p className="mt-2 max-w-md text-sm text-zinc-500">{t('gallery.emptyDesc')}</p>
            <Link
              to="/studio"
              className="mt-6 inline-flex h-11 w-full max-w-xs items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 sm:w-auto"
            >
              {t('gallery.emptyCta')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:gap-4">
            {items.map((item) => {
              const isDownloading = downloadingId === item.id;
              return (
                <article
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl border border-zinc-200/60 bg-white luxury-shadow transition hover:border-zinc-300"
                >
                  <img
                    src={resolveImageUrl(item.imageUrl)}
                    alt=""
                    className="aspect-[3/4] w-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 bg-gradient-to-t from-white/95 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={Boolean(downloadingId)}
                      onClick={() => void handleDownload(item)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 backdrop-blur-md transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      {isDownloading ? t('preview.downloading') : t('gallery.download')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-700 backdrop-blur-md transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      {t('gallery.remove')}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </AppShell>
  );
}
