import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateImage, ApiError, type AspectRatio, type Platform } from './api/generateImage';
import { fetchGuestCredits } from './api/guestCredits';
import { generateProductImage, type ProductFallbackReason } from './api/generateProductImage';
import AlertBanner, { type AlertType } from './components/AlertBanner';
import GeneratedImagePreview from './components/GeneratedImagePreview';
import Header from './components/Header';
import LoadingOverlay from './components/LoadingOverlay';
import LoginModal from './components/LoginModal';
import PricingModal from './components/PricingModal';
import Spinner from './components/Spinner';
import ChatAssistant from './components/ChatAssistant';
import ProductGenerationPanel from './components/ProductGenerationPanel';
import VisualOptionCard from './components/VisualOptionCard';
import { useAuth } from './context/AuthContext';
import { useToast } from './context/ToastContext';
import {
  type ProductGenerationMode,
} from './constants/productGenerationPresets';
import { POST_AUTH_MODAL_KEY } from './constants/authFlow';
import {
  GUEST_CREDITS_INITIAL,
  readGuestCreditsFromStorage,
  writeGuestCreditsToStorage,
} from './constants/guestCredits';
import {
  DEFAULT_TRYON_CATEGORY,
  DEFAULT_TRYON_GENDER,
  type TryOnCategory,
  type TryOnGender,
} from './constants/tryOnOptions';
import {
  InstagramIcon,
  FacebookIcon,
  SquareFormatIcon,
  StoryFormatIcon,
  SparklesIcon,
  DocumentTextIcon,
  ShoppingBagIcon,
} from './components/icons';

const PROMPT_MAX_LENGTH = 2000;
const USER_WISH_MAX_LENGTH = 300;
const PRODUCT_GROK_PROMPT_MAX_LENGTH = 8000;
const OVERLAY_TEXT_MAX_LENGTH = 80;

type Format = AspectRatio;
type AppMode = 'text' | 'product';

interface AlertState {
  message: string;
  type: AlertType;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const { user, profile, loading: authLoading, updateCredits } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<AppMode>('text');
  const [userPrompt, setUserPrompt] = useState('');
  const [productImageBase64, setProductImageBase64] = useState<string | null>(null);
  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState<string | null>(null);
  const [productImageFileError, setProductImageFileError] = useState<string | null>(null);
  const [garmentBase64, setGarmentBase64] = useState<string | null>(null);
  const [garmentPreviewUrl, setGarmentPreviewUrl] = useState<string | null>(null);
  const [garmentFileError, setGarmentFileError] = useState<string | null>(null);
  const [humanBase64, setHumanBase64] = useState<string | null>(null);
  const [humanPreviewUrl, setHumanPreviewUrl] = useState<string | null>(null);
  const [humanFileError, setHumanFileError] = useState<string | null>(null);
  const [selectedModelUrl, setSelectedModelUrl] = useState<string | null>(null);
  const [extractText, setExtractText] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [productGenerationMode, setProductGenerationMode] = useState<ProductGenerationMode>('product');
  const [tryOnGender, setTryOnGender] = useState<TryOnGender>(DEFAULT_TRYON_GENDER);
  const [tryOnCategory, setTryOnCategory] = useState<TryOnCategory>(DEFAULT_TRYON_CATEGORY);
  const [tryOnFallbackReason, setTryOnFallbackReason] = useState<ProductFallbackReason | null>(null);
  const [userWish, setUserWish] = useState('');
  const [productGrokPrompt, setProductGrokPrompt] = useState('');
  const [overlayText, setOverlayText] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [format, setFormat] = useState<Format>('square');
  const [formatManuallySet, setFormatManuallySet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [guestCredits, setGuestCredits] = useState<number | null>(() => readGuestCreditsFromStorage());
  const [guestCreditsLoading, setGuestCreditsLoading] = useState(() => !user && readGuestCreditsFromStorage() === null);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [pricingWelcome, setPricingWelcome] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

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

  useEffect(() => {
    if (user) return;

    let cancelled = false;

    async function syncGuestCredits() {
      const cached = readGuestCreditsFromStorage();
      if (cached === null) {
        setGuestCreditsLoading(true);
      }

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

  useEffect(() => {
    if (authLoading || !user || !profile) return;

    if (sessionStorage.getItem(POST_AUTH_MODAL_KEY)) {
      sessionStorage.removeItem(POST_AUTH_MODAL_KEY);
      setPricingWelcome(true);
      setShowPricingModal(true);
    }
  }, [authLoading, user, profile]);

  const examplePrompts = t('examples', { returnObjects: true }) as string[];

  const promptLength = userPrompt.length;
  const promptIsEmpty = !userPrompt.trim();
  const activeProductBase64 = productGenerationMode === 'product' ? productImageBase64 : garmentBase64;
  const activeProductPreviewUrl = productGenerationMode === 'product' ? productImagePreviewUrl : garmentPreviewUrl;
  const garmentReady = Boolean(garmentBase64) && !garmentFileError;
  const productPhotoReady = Boolean(productImageBase64) && !productImageFileError;
  const humanReady = Boolean(humanBase64) && !humanFileError;
  const tryOnHumanReady = humanReady || Boolean(selectedModelUrl);
  const productImageReady = productGenerationMode === 'tryon'
    ? garmentReady && tryOnHumanReady
    : productPhotoReady;
  const atCharLimit = promptLength >= PROMPT_MAX_LENGTH;
  const displayCredits = user ? (profile?.credits ?? 0) : (guestCredits ?? 0);
  const creditsLoading = user
    ? authLoading || profile === null
    : guestCreditsLoading;
  const hasCredits = displayCredits > 0;
  const canGenerate =
    !loading && (mode === 'text' ? !promptIsEmpty : productImageReady);

  useEffect(() => {
    if (platform === 'instagram' && !formatManuallySet) {
      setFormat('story');
    }
  }, [platform, formatManuallySet]);

  function handlePlatformChange(next: Platform) {
    setPlatform(next);
    if (next === 'instagram') {
      setFormatManuallySet(false);
    }
  }

  function handleFormatChange(next: Format) {
    setFormat(next);
    setFormatManuallySet(true);
  }

  function handlePromptChange(value: string) {
    setUserPrompt(value.slice(0, PROMPT_MAX_LENGTH));
  }

  function handleUserWishChange(value: string) {
    setUserWish(value.slice(0, USER_WISH_MAX_LENGTH));
    setProductGrokPrompt('');
  }

  function handleOverlayTextChange(value: string) {
    setOverlayText(value.slice(0, OVERLAY_TEXT_MAX_LENGTH));
  }

  function handleProductAssistantResult(result: {
    optimizedPrompt: string;
    overlayText: string;
    hashtags: string[];
  }) {
    setProductGrokPrompt(result.optimizedPrompt.slice(0, PRODUCT_GROK_PROMPT_MAX_LENGTH));
    setOverlayText(result.overlayText.slice(0, OVERLAY_TEXT_MAX_LENGTH));
    setIncludeText(true);
    setHashtags(result.hashtags);
  }

  function handleProductGenerationModeChange(next: ProductGenerationMode) {
    if (loading || next === productGenerationMode) return;
    setProductGenerationMode(next);
    setTryOnFallbackReason(null);
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
    setProductGrokPrompt('');
    setOverlayText('');
    setUserWish('');
  }

  function handleModeChange(next: AppMode) {
    if (loading || next === mode) return;
    setMode(next);
    setAlert(null);
    setProductImageFileError(null);
    setGarmentFileError(null);
    setExtractText(false);
    setExtractedText(null);
    setProductGenerationMode('product');
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
    setProductGrokPrompt('');
    setOverlayText('');

    if (next === 'text') {
      setProductImageBase64(null);
      setProductImagePreviewUrl(null);
      setGarmentBase64(null);
      setGarmentPreviewUrl(null);
    }
  }

  function handleProductImageLoaded(base64: string, previewUrl: string) {
    setProductImageBase64(base64);
    setProductImagePreviewUrl(previewUrl);
    setProductImageFileError(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleProductImageClear() {
    setProductImageBase64(null);
    setProductImagePreviewUrl(null);
    setProductImageFileError(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleProductImageFileError(message: string) {
    setProductImageFileError(message);
  }

  function handleGarmentImageLoaded(base64: string, previewUrl: string) {
    setGarmentBase64(base64);
    setGarmentPreviewUrl(previewUrl);
    setGarmentFileError(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleGarmentImageClear() {
    setGarmentBase64(null);
    setGarmentPreviewUrl(null);
    setGarmentFileError(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleGarmentFileError(message: string) {
    setGarmentFileError(message);
  }

  function handleHumanImageLoaded(base64: string, previewUrl: string) {
    setHumanBase64(base64);
    setHumanPreviewUrl(previewUrl);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleHumanImageClear() {
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleHumanFileError(message: string) {
    setHumanFileError(message);
  }

  function handleTryOnModelSelect(url: string) {
    setSelectedModelUrl(url);
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleTryOnModelClear() {
    setSelectedModelUrl(null);
  }

  function handleTryOnGenderChange(next: TryOnGender) {
    setTryOnGender(next);
    setSelectedModelUrl(null);
  }

  function handleTryOnCategoryChange(next: TryOnCategory) {
    setTryOnCategory(next);
    setSelectedModelUrl(null);
  }

  const handleChatPromptGenerated = useCallback((prompt: string) => {
    handlePromptChange(prompt);
    setIsFlashing(true);
    promptTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    promptTextareaRef.current?.focus();
    showAlert(t('chat.promptInserted'), 'success');

    window.setTimeout(() => setIsFlashing(false), 1000);
  }, [t]);

  function handleReset() {
    setUserPrompt('');
    setProductImageBase64(null);
    setProductImagePreviewUrl(null);
    setProductImageFileError(null);
    setGarmentBase64(null);
    setGarmentPreviewUrl(null);
    setGarmentFileError(null);
    setExtractText(false);
    setExtractedText(null);
    setIncludeText(false);
    setOverlayText('');
    setUserWish('');
    setProductGrokPrompt('');
    setProductGenerationMode('product');
    setHumanBase64(null);
    setHumanPreviewUrl(null);
    setHumanFileError(null);
    setSelectedModelUrl(null);
    setPlatform('instagram');
    setFormat('square');
    setFormatManuallySet(false);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
    setAlert(null);
  }

  function showAlert(message: string, type: AlertType = 'error') {
    setAlert({ message, type });
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
      if (err.messageKey && err.messageKey.startsWith('api.')) {
        const translated = t(err.messageKey);
        if (translated !== err.messageKey) {
          return translated;
        }
      }

      if (err.messageKey === 'api.generateFailed' && err.message) {
        return err.message;
      }

      if (err.message && err.messageKey !== 'api.serverUnreachable') {
        return err.message;
      }

      if (err.messageKey) {
        const hint =
          !import.meta.env.PROD && err.messageKey === 'api.serverUnreachable'
            ? t('api.backendHint')
            : '';
        return t(err.messageKey) + hint;
      }
    }
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return t('alerts.error');
  }

  const isProductOcrMode = mode === 'product' && extractText;

  const handleGenerate = useCallback(async () => {
    if (!hasCredits) {
      if (!user) {
        setShowLoginModal(true);
      } else {
        setShowPricingModal(true);
      }
      return;
    }

    if (!canGenerate) return;

    if (mode === 'product' && productGenerationMode === 'product' && includeText && !overlayText.trim()) {
      showAlert(t('ecommerce.overlayTextRequired'), 'error');
      return;
    }

    setLoading(true);
    setAlert(null);
    setTryOnFallbackReason(null);
    setImageUrl(null);
    setHashtags([]);
    setExtractedText(null);

    if (mode === 'product' && activeProductPreviewUrl && !extractText) {
      setOriginalImageUrl(activeProductPreviewUrl);
    }

    const currentLanguage = (i18n.language || 'ru').split('-')[0];

    try {
      if (mode === 'text') {
        const data = await generateImage({
          userPrompt,
          platform,
          aspectRatio: format,
          lang: currentLanguage,
          includeText,
        });

        applyCreditsAndToast(data.creditsRemaining);
        setImageUrl(data.imageUrl);
        setHashtags(data.hashtags);
      } else {
        const data = await generateProductImage({
          base64Image: activeProductBase64!,
          userWish: userWish,
          catalogPrompt: productGrokPrompt || undefined,
          mode: productGenerationMode,
          gender: productGenerationMode === 'tryon' ? tryOnGender : undefined,
          category: productGenerationMode === 'tryon' ? tryOnCategory : undefined,
          humanImage: productGenerationMode === 'tryon'
            ? (humanBase64 ?? selectedModelUrl ?? undefined)
            : undefined,
          platform,
          format,
          extractText: false,
          includeText: productGenerationMode === 'product' ? includeText : false,
          overlayText: productGenerationMode === 'product' && includeText ? overlayText : undefined,
          lang: currentLanguage,
        });

        applyCreditsAndToast(data.creditsRemaining);
        setImageUrl(data.imageUrl);
        setHashtags(data.hashtags);
        setExtractedText(null);

        const silentTryOnFallback = productGenerationMode === 'tryon' && data.branchUsed === 'product';
        setTryOnFallbackReason(
          silentTryOnFallback && data.fallbackReason ? data.fallbackReason : null,
        );
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
  }, [hasCredits, canGenerate, mode, userPrompt, activeProductBase64, activeProductPreviewUrl, userWish, productGrokPrompt, overlayText, productGenerationMode, tryOnGender, tryOnCategory, humanBase64, selectedModelUrl, platform, format, extractText, includeText, t, i18n.language, user, profile?.credits, updateCredits, showToast]);

  const charCounterClass =
    atCharLimit ? 'text-red-400' : promptLength > PROMPT_MAX_LENGTH * 0.9 ? 'text-amber-400' : 'text-slate-500';

  const generateButtonLabel = loading
    ? mode === 'product'
      ? t('form.generating')
      : isProductOcrMode
        ? t('form.extracting')
        : t('form.generating')
    : !hasCredits
      ? t('pricing.buyCredits')
    : mode === 'product'
      ? t('ecommerce.generateButton')
      : isProductOcrMode
        ? t('form.extractTextOnly')
        : t('form.generate');

  const generateButtonClass =
    'flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white shadow-md transition-all duration-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none';

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden bg-white text-slate-900">
      <LoadingOverlay
        visible={loading}
        message={
          isProductOcrMode
            ? t('loading.extractingText')
            : undefined
        }
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div className="absolute -right-16 -top-16 h-[280px] w-[280px] rounded-full bg-indigo-200/30 blur-[100px] backdrop-blur-3xl sm:-right-24 sm:-top-24 sm:h-[560px] sm:w-[560px] sm:blur-[150px]" />
        <div className="absolute -bottom-20 -left-16 h-[260px] w-[260px] rounded-full bg-purple-200/20 blur-[100px] backdrop-blur-3xl sm:-bottom-32 sm:-left-24 sm:h-[520px] sm:w-[520px] sm:blur-[150px]" />
        <div className="absolute bottom-1/3 right-1/3 hidden h-[400px] w-[400px] rounded-full bg-pink-200/15 blur-[120px] backdrop-blur-3xl sm:block" />
      </div>

      <Header
        credits={displayCredits}
        creditsLoading={creditsLoading}
        onCreditsClick={openCreditsFlow}
        onSignInClick={() => setShowLoginModal(true)}
      />

      <LoginModal
        open={showLoginModal}
        onClose={() => setShowLoginModal(false)}
      />

      <PricingModal
        open={showPricingModal}
        onClose={closePricingModal}
        credits={displayCredits}
        welcome={pricingWelcome}
      />

      <main className="contain-width mobile-sticky-offset relative z-10 flex w-full max-w-[100vw] flex-col px-4 pt-16 pb-6 pb-safe sm:px-6 md:px-8 xl:px-12 lg:pb-6">

        {alert && (
          <AlertBanner
            message={alert.message}
            type={alert.type}
            onDismiss={() => setAlert(null)}
            autoDismissMs={alert.type === 'success' ? 5000 : undefined}
          />
        )}

        <div className="contain-width grid w-full min-w-0 grid-cols-1 items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
          <section
            aria-labelledby="create-heading"
            className="contain-width relative z-10 w-full min-w-0 overflow-hidden rounded-2xl border border-white/70 bg-slate-50/75 p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md sm:p-6 lg:col-span-6 lg:p-10"
          >
            <div
              role="tablist"
              aria-label={t('mode.label')}
              className="mb-5 grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-200/50 p-1 sm:mb-6 lg:mb-8"
            >
              <button
                type="button"
                role="tab"
                id="mode-tab-text"
                aria-selected={mode === 'text'}
                aria-controls="mode-panel"
                disabled={loading}
                onClick={() => handleModeChange('text')}
                className={`flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm ${
                  mode === 'text'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <DocumentTextIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate lg:hidden">{t('mode.textShort')}</span>
                <span className="hidden min-w-0 truncate lg:inline">{t('mode.text')}</span>
              </button>
              <button
                type="button"
                role="tab"
                id="mode-tab-product"
                aria-selected={mode === 'product'}
                aria-controls="mode-panel"
                disabled={loading}
                onClick={() => handleModeChange('product')}
                className={`flex h-12 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:px-3 sm:text-sm ${
                  mode === 'product'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <ShoppingBagIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 truncate lg:hidden">{t('mode.productShort')}</span>
                <span className="hidden min-w-0 truncate lg:inline">{t('mode.product')}</span>
              </button>
            </div>

            <h2 id="create-heading" className="mb-2 break-words text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">
              {t('form.title')}
            </h2>
            <p className="mb-6 break-words text-sm font-normal text-slate-500 sm:mb-8">
              {mode === 'text' ? t('form.description') : t('ecommerce.description')}
            </p>

            <div id="mode-panel" role="tabpanel" aria-labelledby={mode === 'text' ? 'mode-tab-text' : 'mode-tab-product'} className="contain-width min-w-0 space-y-6">
              <fieldset disabled={loading} className="contain-width min-w-0 space-y-6 border-0 p-0 disabled:opacity-60">
                {mode === 'text' ? (
                  <div className="space-y-6">
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-2">
                        <label htmlFor="prompt" className="text-sm font-medium text-slate-700">
                          {t('form.promptLabel')}
                        </label>
                        <span
                          id="char-count"
                          className={`text-xs tabular-nums ${charCounterClass}`}
                          aria-live="polite"
                        >
                          {promptLength} / {PROMPT_MAX_LENGTH}
                        </span>
                      </div>

                      <textarea
                        ref={promptTextareaRef}
                        id="prompt"
                        value={userPrompt}
                        onChange={(e) => handlePromptChange(e.target.value)}
                        disabled={loading}
                        maxLength={PROMPT_MAX_LENGTH}
                        aria-describedby="char-count prompt-hints"
                        placeholder={t('form.promptPlaceholder')}
                        rows={6}
                        className={`w-full max-w-full resize-y rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4 py-3 text-base text-slate-900 shadow-inner placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:bg-white focus:ring-1 focus:ring-slate-400/20 disabled:cursor-not-allowed disabled:opacity-50 lg:py-4 lg:text-sm ${
                          isFlashing ? 'prompt-textarea-flash' : ''
                        }`}
                      />
                    </div>

                    <div id="prompt-hints" className="space-y-6">
                      <div className="space-y-3">
                        <p className="text-sm font-normal text-slate-500">{t('form.tryExample')}</p>
                        <div className="flex flex-wrap gap-2">
                          {examplePrompts.map((example) => (
                            <button
                              key={example}
                              type="button"
                              disabled={loading}
                              onClick={() => handlePromptChange(example)}
                              className="max-w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-left text-xs font-normal text-slate-500 shadow-sm transition-all duration-300 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50 sm:py-2"
                            >
                              {example.length > 52 ? `${example.slice(0, 52)}…` : example}
                            </button>
                          ))}
                        </div>
                      </div>

                      <ChatAssistant
                        disabled={loading}
                        onPromptGenerated={handleChatPromptGenerated}
                        onError={(message) => showAlert(message, 'error')}
                      />
                    </div>
                  </div>
                ) : (
                  <ProductGenerationPanel
                    disabled={loading}
                    generationMode={productGenerationMode}
                    onGenerationModeChange={handleProductGenerationModeChange}
                    tryOnGender={tryOnGender}
                    onTryOnGenderChange={handleTryOnGenderChange}
                    tryOnCategory={tryOnCategory}
                    onTryOnCategoryChange={handleTryOnCategoryChange}
                    tryOnFallbackReason={tryOnFallbackReason}
                    garmentBase64={garmentBase64}
                    garmentPreviewUrl={garmentPreviewUrl}
                    garmentFileError={garmentFileError}
                    productImageBase64={productImageBase64}
                    productImagePreviewUrl={productImagePreviewUrl}
                    productImageFileError={productImageFileError}
                    humanBase64={humanBase64}
                    humanPreviewUrl={humanPreviewUrl}
                    humanFileError={humanFileError}
                    selectedModelUrl={selectedModelUrl}
                    userWish={userWish}
                    userWishMaxLength={USER_WISH_MAX_LENGTH}
                    hashtags={hashtags}
                    onAssistantResult={handleProductAssistantResult}
                    onAssistantError={(message) => showAlert(message, 'error')}
                    onGarmentLoaded={handleGarmentImageLoaded}
                    onGarmentClear={handleGarmentImageClear}
                    onGarmentValidationError={handleGarmentFileError}
                    onProductImageLoaded={handleProductImageLoaded}
                    onProductImageClear={handleProductImageClear}
                    onProductImageValidationError={handleProductImageFileError}
                    onHumanLoaded={handleHumanImageLoaded}
                    onHumanClear={handleHumanImageClear}
                    onHumanValidationError={handleHumanFileError}
                    onModelSelect={handleTryOnModelSelect}
                    onModelClear={handleTryOnModelClear}
                    onUserWishChange={handleUserWishChange}
                  />
                )}

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div role="radiogroup" aria-labelledby="platform-label" className="min-w-0">
                    <p id="platform-label" className="mb-4 text-sm font-medium text-slate-700">
                      {t('form.platform')}
                    </p>
                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
                      <VisualOptionCard
                        id="platform-instagram"
                        label={t('platform.instagram')}
                        hint={t('platform.instagramHint')}
                        icon={<InstagramIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                        selected={platform === 'instagram'}
                        disabled={loading}
                        onSelect={() => handlePlatformChange('instagram')}
                      />
                      <VisualOptionCard
                        id="platform-facebook"
                        label={t('platform.facebook')}
                        hint={t('platform.facebookHint')}
                        icon={<FacebookIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                        selected={platform === 'facebook'}
                        disabled={loading}
                        onSelect={() => handlePlatformChange('facebook')}
                      />
                    </div>
                  </div>

                  <div role="radiogroup" aria-labelledby="format-label" className="min-w-0">
                    <div className="mb-4 flex min-w-0 flex-wrap items-center gap-2">
                      <p id="format-label" className="text-sm font-medium text-slate-700">
                        {t('form.format')}
                      </p>
                      {platform === 'instagram' && format === 'story' && !formatManuallySet && (
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-600 shadow-sm">
                          {t('form.autoStory')}
                        </span>
                      )}
                    </div>
                    <div className="grid min-w-0 grid-cols-2 gap-2 sm:gap-4">
                      <VisualOptionCard
                        id="format-square"
                        label={t('format.square')}
                        hint="1:1"
                        icon={<SquareFormatIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                        selected={format === 'square'}
                        disabled={loading}
                        onSelect={() => handleFormatChange('square')}
                      />
                      <VisualOptionCard
                        id="format-story"
                        label={t('format.story')}
                        hint="9:16"
                        icon={<StoryFormatIcon className="h-5 w-5 sm:h-6 sm:w-6" />}
                        selected={format === 'story'}
                        disabled={loading}
                        recommended={platform === 'instagram'}
                        recommendedLabel={t('format.recommended')}
                        onSelect={() => handleFormatChange('story')}
                      />
                    </div>
                  </div>
                </div>

                {((mode === 'text' && !isProductOcrMode) || (mode === 'product' && productGenerationMode === 'product')) && (
                  <div className="space-y-3">
                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:gap-4 sm:px-5 sm:py-4">
                      <label htmlFor="include-text" className="min-w-0 flex-1 cursor-pointer text-sm font-normal leading-snug text-slate-700">
                        {t('form.includeTextLabel')}
                      </label>
                      <button
                        id="include-text"
                        type="button"
                        role="switch"
                        aria-checked={includeText}
                        disabled={loading}
                        onClick={() => setIncludeText((current) => !current)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                          includeText ? 'bg-slate-900' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            includeText ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {includeText && (
                      <div>
                        <label htmlFor="overlay-text" className="mb-2 block text-sm font-medium text-slate-700">
                          {t('ecommerce.overlayTextLabel')}
                        </label>
                        <input
                          id="overlay-text"
                          type="text"
                          value={overlayText}
                          onChange={(event) => handleOverlayTextChange(event.target.value)}
                          disabled={loading}
                          maxLength={OVERLAY_TEXT_MAX_LENGTH}
                          placeholder={t('ecommerce.overlayTextPlaceholder')}
                          className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-900 placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm"
                        />
                      </div>
                    )}
                  </div>
                )}
              </fieldset>

              <div className="flex flex-col gap-3 pt-2 lg:flex-row lg:gap-4">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  aria-label={t('form.resetAria')}
                  className="touch-target flex w-full items-center justify-center rounded-xl border border-slate-200/80 bg-white px-5 py-3.5 text-sm font-medium text-slate-600 shadow-sm transition-all duration-300 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto lg:flex-none lg:py-4"
                >
                  {t('form.reset')}
                </button>

                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  aria-busy={loading}
                  aria-disabled={!canGenerate}
                  className={`${generateButtonClass} touch-target hidden py-4 lg:flex lg:flex-1`}
                >
                  {loading ? (
                    <>
                      <Spinner />
                      {generateButtonLabel}
                    </>
                  ) : (
                    <>
                      <SparklesIcon />
                      {generateButtonLabel}
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          <div className="flex min-h-0 w-full min-w-0 lg:col-span-6">
            <GeneratedImagePreview
            loading={loading}
            format={format}
            imageUrl={imageUrl}
            originalImageUrl={mode === 'product' ? originalImageUrl : null}
            hashtags={hashtags}
            extractedText={extractedText}
            ocrOnly={isProductOcrMode}
            onNotify={showAlert}
          />
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 px-4 pt-3 backdrop-blur-xl lg:hidden pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          aria-busy={loading}
          aria-disabled={!canGenerate}
          className={`${generateButtonClass} touch-target py-4`}
        >
          {loading ? (
            <>
              <Spinner />
              {generateButtonLabel}
            </>
          ) : (
            <>
              <SparklesIcon />
              {generateButtonLabel}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
