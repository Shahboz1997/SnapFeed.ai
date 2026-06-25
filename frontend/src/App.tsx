import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { generateImage, ApiError, type AspectRatio, type Platform } from './api/generateImage';
import { generateProductImage } from './api/generateProductImage';
import AlertBanner, { type AlertType } from './components/AlertBanner';
import GeneratedImagePreview from './components/GeneratedImagePreview';
import LanguageSwitcher from './components/LanguageSwitcher';
import LoadingOverlay from './components/LoadingOverlay';
import Spinner from './components/Spinner';
import ChatAssistant from './components/ChatAssistant';
import ProductImageUpload from './components/ProductImageUpload';
import VisualOptionCard from './components/VisualOptionCard';
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

type Format = AspectRatio;
type AppMode = 'text' | 'product';

interface AlertState {
  message: string;
  type: AlertType;
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<AppMode>('text');
  const [userPrompt, setUserPrompt] = useState('');
  const [base64Image, setBase64Image] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [productFileError, setProductFileError] = useState<string | null>(null);
  const [extractText, setExtractText] = useState(false);
  const [includeText, setIncludeText] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [userWish, setUserWish] = useState('');
  const [platform, setPlatform] = useState<Platform>('instagram');
  const [format, setFormat] = useState<Format>('square');
  const [formatManuallySet, setFormatManuallySet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  const examplePrompts = t('examples', { returnObjects: true }) as string[];

  const promptLength = userPrompt.length;
  const promptIsEmpty = !userPrompt.trim();
  const productImageReady = Boolean(base64Image) && !productFileError;
  const atCharLimit = promptLength >= PROMPT_MAX_LENGTH;
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
  }

  function handleModeChange(next: AppMode) {
    if (loading || next === mode) return;
    setMode(next);
    setAlert(null);
    setProductFileError(null);
    setExtractText(false);
    setExtractedText(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);

    if (next === 'text') {
      setBase64Image(null);
      setImagePreviewUrl(null);
    }
  }

  function handleProductImageLoaded(base64: string, previewUrl: string) {
    setBase64Image(base64);
    setImagePreviewUrl(previewUrl);
    setProductFileError(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleProductImageClear() {
    setBase64Image(null);
    setImagePreviewUrl(null);
    setProductFileError(null);
    setImageUrl(null);
    setOriginalImageUrl(null);
    setHashtags([]);
  }

  function handleProductFileError(message: string) {
    setProductFileError(message);
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
    setBase64Image(null);
    setImagePreviewUrl(null);
    setProductFileError(null);
    setExtractText(false);
    setExtractedText(null);
    setIncludeText(false);
    setUserWish('');
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

  function resolveApiError(err: unknown): string {
    if (err instanceof ApiError) {
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
    if (!canGenerate) return;

    setLoading(true);
    setAlert(null);
    setImageUrl(null);
    setHashtags([]);
    setExtractedText(null);

    if (mode === 'product' && imagePreviewUrl && !extractText) {
      setOriginalImageUrl(imagePreviewUrl);
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

        setImageUrl(data.imageUrl);
        setHashtags(data.hashtags);
      } else {
        const data = await generateProductImage({
          base64Image: base64Image!,
          userWish,
          platform,
          format,
          extractText,
          includeText,
          lang: currentLanguage,
        });

        if (extractText) {
          setImageUrl(null);
          setHashtags(data.hashtags);
          setExtractedText(data.extractedText?.trim() ? data.extractedText : null);
        } else {
          setImageUrl(data.imageUrl);
          setHashtags(data.hashtags);
          setExtractedText(null);
        }
      }

      showAlert(
        extractText && mode === 'product' ? t('alerts.textExtractSuccess') : t('alerts.success'),
        'success',
      );
    } catch (err) {
      showAlert(resolveApiError(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [canGenerate, mode, userPrompt, base64Image, userWish, platform, format, extractText, includeText, imagePreviewUrl, t, i18n.language]);

  const charCounterClass =
    atCharLimit ? 'text-red-400' : promptLength > PROMPT_MAX_LENGTH * 0.9 ? 'text-amber-400' : 'text-slate-500';

  const generateButtonLabel = loading
    ? isProductOcrMode
      ? t('form.extracting')
      : t('form.generating')
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

      <div className="safe-area-top contain-width mobile-sticky-offset relative z-10 flex w-full max-w-[100vw] flex-col px-4 py-6 pb-safe sm:px-6 md:px-8 xl:px-12 lg:pb-6">
        <header className="mb-4 flex w-full flex-col gap-3 sm:mb-8 lg:mb-10 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-base font-bold text-white shadow-md sm:h-11 sm:w-11 sm:text-lg">
              S
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-xl">SnapFeed.ai</h1>
              <p className="truncate text-xs font-normal text-slate-500 sm:text-sm">{t('header.subtitle')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <LanguageSwitcher />
            <div className="flex w-full min-w-0 max-w-full items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 px-3 py-1.5 text-[11px] font-normal text-slate-500 shadow-sm sm:px-4 sm:py-2 sm:text-xs">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
              <span className="min-w-0 truncate">{t('header.poweredBy')}</span>
            </div>
          </div>
        </header>

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
                  <div className="space-y-6">
                    <ProductImageUpload
                      disabled={loading}
                      base64Image={base64Image}
                      previewUrl={imagePreviewUrl}
                      error={productFileError}
                      onImageLoaded={handleProductImageLoaded}
                      onClear={handleProductImageClear}
                      onValidationError={handleProductFileError}
                    />

                    <div>
                      <label htmlFor="user-wish" className="mb-4 block text-sm font-medium text-slate-700">
                        {t('ecommerce.wishLabel')}
                      </label>
                      <input
                        id="user-wish"
                        type="text"
                        value={userWish}
                        onChange={(e) => handleUserWishChange(e.target.value)}
                        disabled={loading || extractText}
                        maxLength={USER_WISH_MAX_LENGTH}
                        placeholder={t('ecommerce.wishPlaceholder')}
                        className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-900 placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 lg:py-4 lg:text-sm"
                      />
                      {!extractText && (
                        <div className="mt-2 space-y-1 text-xs font-normal leading-relaxed text-slate-500">
                          <p>{t('ecommerce.wishHintProduct')}</p>
                          <p>{t('ecommerce.wishHintTryOn')}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:gap-4 sm:px-5 sm:py-4">
                      <label htmlFor="extract-text" className="min-w-0 flex-1 cursor-pointer text-sm font-normal leading-snug text-slate-700">
                        {t('ecommerce.extractTextLabel')}
                      </label>
                      <button
                        id="extract-text"
                        type="button"
                        role="switch"
                        aria-checked={extractText}
                        disabled={loading}
                        onClick={() => setExtractText((current) => !current)}
                        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                          extractText ? 'bg-slate-900' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                            extractText ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
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

                {!isProductOcrMode && (
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
      </div>

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
