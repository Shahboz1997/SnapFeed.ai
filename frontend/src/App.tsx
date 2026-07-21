import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  DEFAULT_STUDIO_OUTPUT_SETTINGS,
  aspectRatioToLegacyFormat,
  creditCostForVariantCount,
  type StudioOutputSettings,
} from './constants/studioOutputSettings';
import {
  composeStudioUserWish,
  type StudioPromptPresetKey,
} from './constants/studioPromptPresets';
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
  const [selectedPromptPresets, setSelectedPromptPresets] = useState<StudioPromptPresetKey[]>([]);
  const [outputSettings, setOutputSettings] = useState<StudioOutputSettings>(
    DEFAULT_STUDIO_OUTPUT_SETTINGS,
  );
  const [autoRunToken, setAutoRunToken] = useState(0);
  const [loading, setLoading] = useState(false);
  const [runningMode, setRunningMode] = useState<StudioMode | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [resultVariantUrls, setResultVariantUrls] = useState<string[]>([]);
  const [historyItems, setHistoryItems] = useState<TryOnHistoryItem[]>(() => listGalleryItems());
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pricingWelcome, setPricingWelcome] = useState(false);

  const studioModeRef = useRef(studioMode);
  const generationIdRef = useRef(0);
  studioModeRef.current = studioMode;

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
  const generationCreditCost = creditCostForVariantCount(outputSettings.numImages);
  const hasCredits = displayCredits >= generationCreditCost;

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

  function applyCreditsAndToast(creditsRemaining?: number, creditCost = 1) {
    if (user) {
      if (typeof creditsRemaining === 'number') {
        updateCredits(creditsRemaining);
      } else if (typeof profile?.credits === 'number') {
        updateCredits(Math.max(0, profile.credits - creditCost));
      }
      showToast(t('toasts.creditDeducted', { count: creditCost }));
      return;
    }

    if (typeof creditsRemaining === 'number') {
      setGuestCredits(creditsRemaining);
      writeGuestCreditsToStorage(creditsRemaining);
    } else {
      setGuestCredits((current) => {
        const newCredits = Math.max(0, (current ?? 0) - creditCost);
        writeGuestCreditsToStorage(newCredits);
        return newCredits;
      });
    }

    showToast(t('toasts.creditDeducted', { count: creditCost }));
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
    setResultVariantUrls([]);
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
    setResultVariantUrls([]);
  }

  function handleTryOnModelSelect(url: string) {
    setSelectedModelUrl(url);
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setImageUrl(null);
    setResultVariantUrls([]);
  }

  function handleBackToSetup() {
    setImageUrl(null);
    setResultVariantUrls([]);
    setAlert(null);
  }

  function handleSelectHistory(item: TryOnHistoryItem) {
    setImageUrl(item.imageUrl);
    setResultVariantUrls([item.imageUrl]);
  }

  function handleStudioModeChange(mode: StudioMode) {
    if (mode === studioMode) return;
    setStudioMode(mode);
    setImageUrl(null);
    setResultVariantUrls([]);
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
    setResultVariantUrls([]);
    setTryOnPrompt('');
    setSelectedPromptPresets([]);
    setAlert(null);
  }

  const handleGenerate = useCallback(async () => {
    if (loading) return;

    if (!hasCredits) {
      if (!user) setShowLoginModal(true);
      else setShowPricingModal(true);
      return;
    }

    if (!canGenerate || !garmentBase64) return;

    const jobId = ++generationIdRef.current;
    const jobMode = studioMode;

    setLoading(true);
    setRunningMode(jobMode);
    setAlert(null);
    setImageUrl(null);
    setResultVariantUrls([]);

    const previewSource = garmentPreviewUrl;
    const currentLanguage = (i18n.language || 'ru').split('-')[0];
    const userWish = composeStudioUserWish(tryOnPrompt, selectedPromptPresets) || undefined;
    const creditCost = creditCostForVariantCount(outputSettings.numImages);

    try {
      const data = await generateProductImage({
        base64Image: garmentBase64,
        mode: jobMode,
        gender: jobMode === 'tryon' ? DEFAULT_TRYON_GENDER : undefined,
        category: jobMode === 'tryon' ? DEFAULT_TRYON_CATEGORY : undefined,
        humanImage: jobMode === 'tryon'
          ? (humanBase64 ?? selectedModelUrl ?? (DEFAULT_STUDIO_MODEL_URL || undefined))
          : undefined,
        userWish,
        platform: 'instagram',
        format: aspectRatioToLegacyFormat(outputSettings.aspectRatio),
        aspectRatio: outputSettings.aspectRatio,
        resolution: outputSettings.resolution,
        qualityMode: outputSettings.qualityMode,
        numImages: outputSettings.numImages,
        extractText: false,
        includeText: false,
        lang: currentLanguage,
      });

      applyCreditsAndToast(data.creditsRemaining, data.creditsCharged ?? creditCost);

      const urls = (data.imageUrls?.length
        ? data.imageUrls
        : data.imageUrl
          ? [data.imageUrl]
          : []
      ).filter(Boolean);

      for (const url of urls) {
        addGalleryItem({
          imageUrl: url,
          originalImageUrl: previewSource,
          hashtags: data.hashtags,
        });
      }
      if (urls.length) {
        refreshHistory();
      }

      // Only bind result to UI if user is still on the mode that started this job.
      if (jobId === generationIdRef.current && studioModeRef.current === jobMode) {
        setResultVariantUrls(urls);
        setImageUrl(urls[0] ?? null);
      } else if (urls.length) {
        showToast(t('studio.readyInGallery'), 'success');
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
      if (jobId === generationIdRef.current && studioModeRef.current === jobMode) {
        showAlert(resolveApiError(err), 'error');
      }
    } finally {
      if (jobId === generationIdRef.current) {
        setLoading(false);
        setRunningMode(null);
      }
    }
  }, [
    loading,
    hasCredits,
    canGenerate,
    garmentBase64,
    garmentPreviewUrl,
    tryOnPrompt,
    selectedPromptPresets,
    outputSettings,
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
      : generationCreditCost > 1
        ? t('studio.runWithCredits', { count: generationCreditCost })
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

      <main className="mobile-sticky-offset relative mx-auto flex w-full max-w-6xl flex-col px-2.5 py-3 sm:px-6 sm:py-5 lg:px-8">
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
            disabled={loading && runningMode === studioMode}
            studioMode={studioMode}
            runningMode={runningMode}
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
            selectedPromptPresets={selectedPromptPresets}
            onSelectedPromptPresetsChange={setSelectedPromptPresets}
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
            outputSettings={outputSettings}
            onOutputSettingsChange={setOutputSettings}
            resultImageUrl={imageUrl}
            resultVariantUrls={resultVariantUrls}
            onSelectVariant={setImageUrl}
            historyItems={historyItems}
            onSelectHistory={handleSelectHistory}
            onBackToSetup={handleBackToSetup}
            onNotify={showAlert}
          />
        </fieldset>

        <div className="mt-4 flex justify-end gap-2">
          {(imageUrl || (loading && runningMode === studioMode)) && (
            <button
              type="button"
              onClick={handleBackToSetup}
              disabled={loading && runningMode === studioMode}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
            >
              {t('studio.newGeneration')}
            </button>
          )}
          <button
            type="button"
            onClick={handleReset}
            disabled={loading && runningMode === studioMode}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
          >
            {t('form.reset')}
          </button>
        </div>
      </main>
    </AppShell>
  );
}
