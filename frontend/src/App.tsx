import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError } from './api/generateImage';
import { fetchGuestCredits } from './api/guestCredits';
import { generateProductImage } from './api/generateProductImage';
import AlertBanner, { type AlertType } from './components/AlertBanner';
import AppShell from './components/AppShell';
import LoginModal from './components/LoginModal';
import PricingModal from './components/PricingModal';
import TryOnWorkspace, { type StudioMode, type TryOnHistoryItem } from './components/TryOnWorkspace';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import { POST_AUTH_MODAL_KEY } from './constants/authFlow';
import {
  GUEST_CREDITS_INITIAL,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from './constants/guestCredits';
import {
  DEFAULT_TRYON_CATEGORY,
  DEFAULT_TRYON_GENDER,
} from './constants/tryOnOptions';
import { DEFAULT_STUDIO_MODEL_URL } from './constants/tryOnModels';
import { addGalleryItem, listGalleryItems } from './lib/galleryStorage';

interface AlertState {
  message: string;
  type: AlertType;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { user, profile, loading: authLoading, updateCredits } = useAuth();
  const { showToast } = useToast();

  const [studioMode, setStudioMode] = useState<StudioMode>('product-to-model');
  const [garmentBase64, setGarmentBase64] = useState<string | null>(null);
  const [garmentPreviewUrl, setGarmentPreviewUrl] = useState<string | null>(null);
  const [garmentFileError, setGarmentFileError] = useState<string | null>(null);
  const [humanBase64, setHumanBase64] = useState<string | null>(null);
  const [humanPreviewUrl, setHumanPreviewUrl] = useState<string | null>(null);
  const [humanFileError, setHumanFileError] = useState<string | null>(null);
  const [selectedModelUrl, setSelectedModelUrl] = useState<string | null>(null);
  const [tryOnPrompt, setTryOnPrompt] = useState('');
  const [autoRunToken, setAutoRunToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<TryOnHistoryItem[]>(() => listGalleryItems());
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pricingWelcome, setPricingWelcome] = useState(false);

  const garmentReady = Boolean(garmentBase64) && !garmentFileError;
  const tryOnHumanReady = (Boolean(humanBase64) && !humanFileError) || Boolean(selectedModelUrl);
  const canGenerate = !loading
    && garmentReady
    && (studioMode === 'packshot'
      || studioMode === 'product-to-model'
      || studioMode === 'tryon'
      || tryOnHumanReady);
  const displayCredits = user ? (profile?.credits ?? 0) : (guestCredits ?? 0);
  const creditsLoading = user ? authLoading || profile === null : guestCreditsLoading;
  const hasCredits = displayCredits > 0;

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

  function closePricingModal() {
    setShowPricingModal(false);
    setPricingWelcome(false);
  }

  function openCreditsFlow() {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    setShowPricingModal(true);
  }

  function showAlert(message: string, type: AlertType = 'error') {
    setAlert({ message, type });
  }

  function refreshHistory() {
    setHistoryItems(listGalleryItems());
  }

  function applyCreditsAndToast(creditsRemaining?: number) {
    if (user) {
      if (typeof creditsRemaining === 'number') {
        updateCredits(creditsRemaining);
      } else if (typeof profile?.credits === 'number') {
        updateCredits(Math.max(0, profile.credits - 1));
      }
      showToast(t('toasts.creditDeducted'));
      return;
    }

    if (typeof creditsRemaining === 'number') {
      setGuestCredits(creditsRemaining);
      writeGuestCreditsToStorage(creditsRemaining);
    } else {
      setGuestCredits((current) => {
        const newCredits = Math.max(0, (current ?? 0) - 1);
        writeGuestCreditsToStorage(newCredits);
        return newCredits;
      });
    }

    showToast(t('toasts.creditDeducted'));
  }

  function resolveApiError(err: unknown): string {
    if (err instanceof ApiError) {
      if (
        err.message
        && err.messageKey === 'api.generateFailed'
        && err.message !== 'Failed to generate image.'
      ) {
        return err.message;
      }
      if (err.messageKey && err.messageKey.startsWith('api.')) {
        const translated = t(err.messageKey);
        if (translated !== err.messageKey) return translated;
      }
      if (err.message && err.messageKey !== 'api.serverUnreachable') return err.message;
      if (err.messageKey) {
        const hint =
          !import.meta.env.PROD && err.messageKey === 'api.serverUnreachable'
            ? t('api.backendHint')
            : '';
        return t(err.messageKey) + hint;
      }
    }
    if (err instanceof Error && err.message) return err.message;
    return t('alerts.error');
  }

  function handleGarmentImageLoaded(base64: string, previewUrl: string) {
    setGarmentBase64(base64);
    setGarmentPreviewUrl(previewUrl);
    setGarmentFileError(null);
    setImageUrl(null);
    // Product → Model: FASHN picks the model; start as soon as the garment is ready.
    if (studioMode === 'product-to-model') {
      setAutoRunToken((token) => token + 1);
    }
  }

  function handleGarmentImageClear() {
    setGarmentBase64(null);
    setGarmentPreviewUrl(null);
    setGarmentFileError(null);
    setImageUrl(null);
  }

  function handleHumanImageLoaded(base64: string, previewUrl: string) {
    setHumanBase64(base64);
    setHumanPreviewUrl(previewUrl);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setImageUrl(null);
  }

  function handleHumanImageClear() {
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setImageUrl(null);
  }

  function handleTryOnModelSelect(url: string) {
    setSelectedModelUrl(url);
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setImageUrl(null);
  }

  function handleBackToSetup() {
    setImageUrl(null);
    setAlert(null);
  }

  function handleSelectHistory(item: TryOnHistoryItem) {
    setImageUrl(item.imageUrl);
  }

  function handleStudioModeChange(mode: StudioMode) {
    if (mode === studioMode) return;
    setStudioMode(mode);
    setImageUrl(null);
    setAlert(null);
  }

  function handleReset() {
    setGarmentBase64(null);
    setGarmentPreviewUrl(null);
    setGarmentFileError(null);
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setImageUrl(null);
    setTryOnPrompt('');
    setAlert(null);
  }

  const handleGenerate = useCallback(async () => {
    if (!hasCredits) {
      if (!user) setShowLoginModal(true);
      else setShowPricingModal(true);
      return;
    }

    if (!canGenerate || !garmentBase64) return;

    setLoading(true);
    setAlert(null);
    setImageUrl(null);

    const previewSource = garmentPreviewUrl;
    const currentLanguage = (i18n.language || 'ru').split('-')[0];

    try {
      const data = await generateProductImage({
        base64Image: garmentBase64,
        mode: studioMode,
        gender: studioMode === 'tryon' ? DEFAULT_TRYON_GENDER : undefined,
        category: studioMode === 'tryon' ? DEFAULT_TRYON_CATEGORY : undefined,
        humanImage: studioMode === 'tryon'
          ? (humanBase64 ?? selectedModelUrl ?? (DEFAULT_STUDIO_MODEL_URL || undefined))
          : undefined,
        userWish: tryOnPrompt.trim() || undefined,
        platform: 'instagram',
        format: 'story',
        extractText: false,
        includeText: false,
        lang: currentLanguage,
      });

      applyCreditsAndToast(data.creditsRemaining);
      setImageUrl(data.imageUrl);

      if (data.imageUrl) {
        addGalleryItem({
          imageUrl: data.imageUrl,
          originalImageUrl: previewSource,
          hashtags: data.hashtags,
        });
        refreshHistory();
      }
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 402) {
        if (!user) {
          setGuestCredits(0);
          writeGuestCreditsToStorage(0);
          setShowLoginModal(true);
        } else {
          setShowPricingModal(true);
        }
        return;
      }
      showAlert(resolveApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [
    hasCredits,
    canGenerate,
    garmentBase64,
    garmentPreviewUrl,
    tryOnPrompt,
    humanBase64,
    selectedModelUrl,
    studioMode,
    t,
    i18n.language,
    user,
    profile?.credits,
    updateCredits,
    showToast,
  ]);

  useEffect(() => {
    if (autoRunToken === 0 || loading) return;
    if (studioMode !== 'product-to-model') return;
    if (!garmentBase64 || garmentFileError) return;
    setAutoRunToken(0);
    void handleGenerate();
  }, [
    autoRunToken,
    loading,
    studioMode,
    garmentBase64,
    garmentFileError,
    handleGenerate,
  ]);

  const generateButtonLabel = loading
    ? t('studio.running')
    : !hasCredits
      ? t('pricing.buyCredits')
      : t('studio.run');

  return (
    <AppShell
      variant="studio"
      credits={displayCredits}
      creditsLoading={creditsLoading}
      onCreditsClick={openCreditsFlow}
      onSignInClick={() => setShowLoginModal(true)}
    >
      <LoginModal open={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PricingModal
        open={showPricingModal}
        onClose={closePricingModal}
        credits={displayCredits}
        welcome={pricingWelcome}
      />

      <main className="mobile-sticky-offset relative mx-auto flex w-full max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-5 lg:px-8">
        {alert && (
          <AlertBanner
            message={alert.message}
            type={alert.type}
            onDismiss={() => setAlert(null)}
            autoDismissMs={alert.type === 'success' ? 5000 : undefined}
          />
        )}

        <fieldset className="min-w-0 border-0 p-0">
          <TryOnWorkspace
            disabled={loading}
            studioMode={studioMode}
            onStudioModeChange={handleStudioModeChange}
            garmentBase64={garmentBase64}
            garmentPreviewUrl={garmentPreviewUrl}
            garmentFileError={garmentFileError}
            humanBase64={humanBase64}
            humanPreviewUrl={humanPreviewUrl}
            humanFileError={humanFileError}
            selectedModelUrl={selectedModelUrl}
            prompt={tryOnPrompt}
            onPromptChange={setTryOnPrompt}
            onGarmentLoaded={handleGarmentImageLoaded}
            onGarmentClear={handleGarmentImageClear}
            onGarmentValidationError={setGarmentFileError}
            onHumanLoaded={handleHumanImageLoaded}
            onHumanClear={handleHumanImageClear}
            onHumanValidationError={setHumanFileError}
            onModelSelect={handleTryOnModelSelect}
            onModelClear={() => setSelectedModelUrl(null)}
            onRun={handleGenerate}
            canRun={canGenerate || !hasCredits}
            running={loading}
            runLabel={generateButtonLabel}
            resultImageUrl={imageUrl}
            historyItems={historyItems}
            onSelectHistory={handleSelectHistory}
            onBackToSetup={handleBackToSetup}
            onNotify={showAlert}
          />
        </fieldset>

        <div className="mt-4 flex justify-end gap-2">
          {(imageUrl || loading) && (
            <button
              type="button"
              onClick={handleBackToSetup}
              disabled={loading}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
            >
              {t('studio.newGeneration')}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={loading}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
          >
            {t('form.reset')}
          </button>
        </div>
      </main>
    </AppShell>
  );
}
