import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  deleteCloudGalleryItem,
  fetchCloudGallery,
  setCloudGalleryCollection,
} from '../api/cloudGallery';
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
import {
  GALLERY_COLLECTIONS,
  type GalleryCollection,
} from '../constants/galleryCollections';
import {
  listGalleryItems,
  removeGalleryItem,
  setGalleryItemCollection,
  type GalleryItem,
} from '../lib/galleryStorage';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import { downloadWithWatermark } from '../utils/shareResult';

type FilterKey = 'all' | GalleryCollection;

export default function GalleryPage() {
  const { t } = useTranslation();
  const { user, profile, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  const displayCredits = user ? (profile?.credits ?? 0) : (guestCredits ?? 0);
  const creditsLoading = user ? authLoading || profile === null : guestCreditsLoading;

  const filteredItems = useMemo(() => {
    if (filter === 'all') return items;
    return items.filter((item) => item.collection === filter);
  }, [filter, items]);

  useEffect(() => {
    let cancelled = false;

    async function loadGallery() {
      setGalleryLoading(true);

      if (!user) {
        if (!cancelled) {
          setItems(listGalleryItems());
          setGalleryLoading(false);
        }
        return;
      }

      try {
        const cloudItems = await fetchCloudGallery();
        if (!cancelled) setItems(cloudItems);
      } catch {
        if (!cancelled) {
          setItems([]);
          showToast(t('alerts.galleryLoadFailed', { defaultValue: 'Failed to load gallery.' }), 'error');
        }
      } finally {
        if (!cancelled) setGalleryLoading(false);
      }
    }

    if (authLoading) return;
    void loadGallery();
    return () => { cancelled = true; };
  }, [user, authLoading, showToast, t]);

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

  async function handleRemove(id: string) {
    if (removingId) return;

    if (!user) {
      removeGalleryItem(id);
      setItems(listGalleryItems());
      return;
    }

    setRemovingId(id);
    try {
      await deleteCloudGalleryItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch {
      showToast(t('alerts.galleryRemoveFailed', { defaultValue: 'Failed to remove image.' }), 'error');
    } finally {
      setRemovingId(null);
    }
  }

  async function handleDownload(item: GalleryItem) {
    if (downloadingId) return;
    setDownloadingId(item.id);
    try {
      await downloadWithWatermark(item.imageUrl, `snapfeed-gallery-${item.id}.png`);
      showToast(t('alerts.downloadSuccess'), 'success');
    } catch {
      try {
        const blob = await downloadImageBlob(item.imageUrl);
        triggerBlobDownload(blob, `snapfeed-gallery-${item.id}.png`);
        showToast(t('alerts.downloadSuccess'), 'success');
      } catch {
        showToast(t('alerts.downloadWarning'), 'error');
      }
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleCollectionChange(item: GalleryItem, collection: string) {
    const next = collection || null;
    try {
      if (!user) {
        setGalleryItemCollection(item.id, next);
        setItems(listGalleryItems());
        return;
      }
      await setCloudGalleryCollection(item.id, next);
      setItems((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, collection: next } : row
      )));
    } catch {
      showToast(t('gallery.collectionFailed'), 'error');
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

        <div className="mb-4 flex flex-wrap gap-1.5">
          {(['all', ...GALLERY_COLLECTIONS] as FilterKey[]).map((key) => {
            const active = filter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-zinc-900 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                }`}
              >
                {key === 'all' ? t('gallery.filterAll') : t(`gallery.collections.${key}`)}
              </button>
            );
          })}
        </div>

        {galleryLoading ? (
          <div className="glass-panel luxury-shadow flex min-h-[280px] items-center justify-center rounded-2xl sm:min-h-[420px] sm:rounded-3xl">
            <p className="text-sm text-zinc-500">{t('gallery.loading', { defaultValue: 'Loading gallery…' })}</p>
          </div>
        ) : filteredItems.length === 0 ? (
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
            {filteredItems.map((item) => {
              const isDownloading = downloadingId === item.id;
              const isRemoving = removingId === item.id;
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
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-gradient-to-t from-white/95 to-transparent p-2.5 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                    <label className="sr-only" htmlFor={`collection-${item.id}`}>
                      {t('gallery.saveToCollection')}
                    </label>
                    <select
                      id={`collection-${item.id}`}
                      value={item.collection || ''}
                      onChange={(e) => void handleCollectionChange(item, e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white/95 px-2 py-1 text-[10px] font-semibold text-zinc-700"
                    >
                      <option value="">{t('gallery.noCollection')}</option>
                      {GALLERY_COLLECTIONS.map((key) => (
                        <option key={key} value={key}>
                          {t(`gallery.collections.${key}`)}
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={Boolean(downloadingId) || Boolean(removingId)}
                        onClick={() => void handleDownload(item)}
                        className="min-h-9 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 backdrop-blur-md transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {isDownloading ? t('preview.downloading') : t('gallery.download')}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(removingId) || Boolean(downloadingId)}
                        onClick={() => void handleRemove(item.id)}
                        className="min-h-9 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-zinc-700 backdrop-blur-md transition hover:border-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {isRemoving ? '…' : t('gallery.remove')}
                      </button>
                    </div>
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
