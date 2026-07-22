import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  Gem,
  Grid2x2,
  ImageIcon,
  Layers,
  Maximize2,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Scale,
  Settings2,
  Shirt,
  SlidersHorizontal,
  Sparkles,
  Upload,
  UserRound,
  X,
  Zap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadImageBlob, triggerBlobDownload } from '../api/downloadImage';
import {
  STUDIO_PROMPT_PRESET_KEYS,
  type StudioPromptPresetKey,
} from '../constants/studioPromptPresets';
import {
  STUDIO_MODE_EXAMPLES,
  PACKSHOT_FAN,
  PACKSHOT_SAMPLE_PRODUCT,
  PRODUCT_TO_MODEL_FAN,
  PRODUCT_TO_MODEL_SAMPLE_PRODUCT,
  TRYON_MODEL_FAN,
  TRYON_PRODUCT_FAN,
} from '../constants/studioModeExamples';
import {
  DEFAULT_STUDIO_OUTPUT_SETTINGS,
  STUDIO_ASPECT_RATIOS,
  STUDIO_QUALITY_MODES,
  STUDIO_RESOLUTIONS,
  STUDIO_VARIANT_COUNTS,
  creditCostForVariantCount,
  resolutionLabel,
  resolutionMenuLabel,
  type StudioAspectRatio,
  type StudioOutputSettings,
  type StudioQualityMode,
  type StudioResolution,
  type StudioVariantCount,
} from '../constants/studioOutputSettings';
import type { GalleryItem } from '../lib/galleryStorage';
import { compressImageForUpload } from '../utils/compressImageForUpload';
import { resolveImageUrl } from '../utils/resolveImageUrl';
import Lightbox from './Lightbox';

const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

/** Example frames shown while a generation is in progress. */
const GENERATION_WAIT_FRAMES = [
  '/studio-examples/product-to-model-after.png',
  '/studio-examples/product-to-model-after-2.png',
  '/fashn-tryon-result.png',
  '/studio-examples/product-to-model-before.png',
  '/studio-examples/product-to-model-before-2.png',
] as const;

const WAIT_TIP_KEYS = [
  'studio.waitTips.fitting',
  'studio.waitTips.lighting',
  'studio.waitTips.pose',
  'studio.waitTips.details',
  'studio.waitTips.almost',
] as const;

const FRAME_MS = 2800;
const TIP_MS = 2200;

export type TryOnHistoryItem = Pick<GalleryItem, 'id' | 'imageUrl' | 'hashtags'>;
export type StudioMode = 'tryon' | 'packshot' | 'product-to-model';

type TryOnWorkspaceProps = {
  disabled?: boolean;
  studioMode?: StudioMode;
  /** Mode that started the in-flight job; used so switching tabs leaves the waiting view. */
  runningMode?: StudioMode | null;
  onStudioModeChange?: (mode: StudioMode) => void;
  garmentBase64: string | null;
  garmentPreviewUrl: string | null;
  garmentFileError: string | null;
  humanBase64: string | null;
  humanPreviewUrl: string | null;
  humanFileError: string | null;
  selectedModelUrl: string | null;
  prompt: string;
  onPromptChange: (value: string) => void;
  selectedPromptPresets?: StudioPromptPresetKey[];
  onSelectedPromptPresetsChange?: (keys: StudioPromptPresetKey[]) => void;
  onGarmentLoaded: (base64: string, previewUrl: string) => void;
  onGarmentClear: () => void;
  onGarmentValidationError: (message: string) => void;
  onHumanLoaded: (base64: string, previewUrl: string) => void;
  onHumanClear: () => void;
  onHumanValidationError: (message: string) => void;
  onModelSelect: (url: string) => void;
  onModelClear: () => void;
  onRun: () => void;
  canRun: boolean;
  running?: boolean;
  runLabel: string;
  outputSettings?: StudioOutputSettings;
  onOutputSettingsChange?: (settings: StudioOutputSettings) => void;
  resultImageUrl?: string | null;
  resultVariantUrls?: string[];
  onSelectVariant?: (url: string) => void;
  historyItems?: TryOnHistoryItem[];
  onSelectHistory?: (item: TryOnHistoryItem) => void;
  onBackToSetup?: () => void;
  onNotify?: (message: string, type: 'success' | 'warning' | 'error') => void;
};

const MODE_ORDER: StudioMode[] = ['product-to-model', 'tryon', 'packshot'];

async function readImageFile(file: File, preserveQuality: boolean): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('read failed'));
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });

  if (preserveQuality) return dataUrl;
  return compressImageForUpload(dataUrl);
}

function isImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export default function TryOnWorkspace({
  disabled = false,
  studioMode = 'tryon',
  runningMode = null,
  onStudioModeChange,
  garmentBase64,
  garmentPreviewUrl,
  garmentFileError,
  humanBase64,
  humanPreviewUrl,
  humanFileError,
  selectedModelUrl,
  prompt,
  onPromptChange,
  selectedPromptPresets = [],
  onSelectedPromptPresetsChange,
  onGarmentLoaded,
  onGarmentClear,
  onGarmentValidationError,
  onHumanLoaded,
  onHumanClear,
  onHumanValidationError,
  onModelSelect: _onModelSelect,
  onModelClear,
  onRun,
  canRun,
  running = false,
  runLabel,
  outputSettings = DEFAULT_STUDIO_OUTPUT_SETTINGS,
  onOutputSettingsChange,
  resultImageUrl = null,
  resultVariantUrls = [],
  onSelectVariant,
  historyItems = [],
  onSelectHistory,
  onBackToSetup,
  onNotify,
}: TryOnWorkspaceProps) {
  const { t } = useTranslation();
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const humanInputRef = useRef<HTMLInputElement>(null);
  const studioDockRef = useRef<HTMLDivElement>(null);
  const [garmentDragging, setGarmentDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const sessionStageRef = useRef<HTMLDivElement>(null);
  const isProductOnly = studioMode === 'packshot' || studioMode === 'product-to-model';

  const modelPreviewUrl = humanPreviewUrl || selectedModelUrl;
  const hasGarment = Boolean(garmentBase64 || garmentPreviewUrl);
  const hasModel = Boolean(humanBase64 || selectedModelUrl);
  const waitingInThisMode = running && runningMode === studioMode;
  const inSession = waitingInThisMode || Boolean(resultImageUrl);
  const displayResultUrl = resolveImageUrl(resultImageUrl);

  useLayoutEffect(() => {
    if (!inSession) return;
    const stage = sessionStageRef.current;
    if (!stage) return;
    // Keep waiting animation / result fully in view above the sticky dock.
    stage.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [inSession, waitingInThisMode, resultImageUrl]);

  useEffect(() => {
    const dock = studioDockRef.current;
    if (!dock || typeof ResizeObserver === 'undefined') return undefined;

    const syncDockHeight = () => {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (isDesktop) {
        document.documentElement.style.removeProperty('--studio-dock-height');
        return;
      }
      const height = Math.ceil(dock.getBoundingClientRect().height);
      if (height > 0) {
        document.documentElement.style.setProperty('--studio-dock-height', `${height}px`);
      }
    };

    syncDockHeight();
    const observer = new ResizeObserver(syncDockHeight);
    observer.observe(dock);
    window.addEventListener('resize', syncDockHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncDockHeight);
      document.documentElement.style.removeProperty('--studio-dock-height');
    };
  }, []);

  async function handleFile(file: File | undefined, kind: 'garment' | 'human') {
    if (!file || disabled) return;
    const onError = kind === 'garment' ? onGarmentValidationError : onHumanValidationError;
    const onLoaded = kind === 'garment' ? onGarmentLoaded : onHumanLoaded;

    if (!isImageFile(file)) {
      onError(t('ecommerce.invalidType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      onError(t('ecommerce.fileTooLarge'));
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readImageFile(file, true);
      if (kind === 'human') onModelClear();
      onLoaded(dataUrl, dataUrl);
    } catch {
      onError(t('ecommerce.readFailed'));
    } finally {
      setUploading(false);
    }
  }

  function onGarmentInput(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0], 'garment');
    event.target.value = '';
  }

  function onHumanInput(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0], 'human');
    event.target.value = '';
  }

  function onGarmentDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setGarmentDragging(false);
    void handleFile(event.dataTransfer.files?.[0], 'garment');
  }

  async function handlePasteModel() {
    if (disabled || !navigator.clipboard?.read) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((entry) => entry.startsWith('image/'));
        if (!type) continue;
        const blob = await item.getType(type);
        const file = new File([blob], 'pasted.png', { type: blob.type || 'image/png' });
        await handleFile(file, 'human');
        return;
      }
    } catch {
      onHumanValidationError(t('studio.pasteFailed'));
    }
  }

  async function handleFanGarmentPick(url: string = PRODUCT_TO_MODEL_SAMPLE_PRODUCT) {
    if (disabled) return;
    setUploading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('read failed'));
        };
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      onGarmentLoaded(dataUrl, dataUrl);
    } catch {
      onGarmentValidationError(t('ecommerce.readFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleFanModelPick(url: string) {
    if (disabled) return;
    setUploading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('fetch failed');
      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result);
          else reject(new Error('read failed'));
        };
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(blob);
      });
      onModelClear();
      onHumanLoaded(dataUrl, dataUrl);
    } catch {
      onHumanValidationError(t('ecommerce.readFailed'));
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(url?: string | null) {
    const target = url || resultImageUrl;
    if (!target || downloading || running) return;
    setDownloading(true);
    try {
      const blob = await downloadImageBlob(target);
      triggerBlobDownload(blob, `snapfeed-story-${Date.now()}.png`);
      onNotify?.(t('alerts.downloadSuccess'), 'success');
    } catch {
      onNotify?.(t('alerts.downloadWarning'), 'warning');
    } finally {
      setDownloading(false);
    }
  }

  function togglePromptPreset(key: StudioPromptPresetKey) {
    if (!onSelectedPromptPresetsChange) return;
    const active = selectedPromptPresets.includes(key);
    onSelectedPromptPresetsChange(
      active
        ? selectedPromptPresets.filter((item) => item !== key)
        : [...selectedPromptPresets, key],
    );
  }

  const modeMeta: Record<StudioMode, { icon: ReactNode; label: string; example: (typeof STUDIO_MODE_EXAMPLES)[StudioMode] }> = {
    'product-to-model': {
      icon: <UserRound className="h-3.5 w-3.5" />,
      label: t('studio.modeProductToModel'),
      example: STUDIO_MODE_EXAMPLES['product-to-model'],
    },
    tryon: {
      icon: <Shirt className="h-3.5 w-3.5" />,
      label: t('studio.modeTryOn'),
      example: STUDIO_MODE_EXAMPLES.tryon,
    },
    packshot: {
      icon: <Package className="h-3.5 w-3.5" />,
      label: t('studio.modePackshot'),
      example: STUDIO_MODE_EXAMPLES.packshot,
    },
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:gap-3 lg:gap-4">
      <input
        ref={garmentInputRef}
        type="file"
        accept={`${ACCEPT},image/*`}
        className="sr-only"
        disabled={disabled}
        onChange={onGarmentInput}
      />
      <input
        ref={humanInputRef}
        type="file"
        accept={`${ACCEPT},image/*`}
        className="sr-only"
        disabled={disabled}
        onChange={onHumanInput}
      />

      {lightboxUrl ? (
        <Lightbox
          imageUrl={lightboxUrl}
          alt={t('preview.imageAlt')}
          onClose={() => setLightboxUrl(null)}
        />
      ) : null}

      {inSession ? (
        <SessionLayout
          stageRef={sessionStageRef}
          garmentPreviewUrl={garmentPreviewUrl}
          modelPreviewUrl={isProductOnly ? null : modelPreviewUrl}
          showModelThumb={!isProductOnly}
          running={running}
          disabled={disabled}
          resultImageUrl={displayResultUrl}
          resultVariantUrls={resultVariantUrls}
          onSelectVariant={onSelectVariant}
          historyItems={historyItems}
          activeResultUrl={resultImageUrl}
          downloading={downloading}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          onBackToSetup={onBackToSetup}
          onReplaceGarment={() => garmentInputRef.current?.click()}
          onReplaceModel={() => humanInputRef.current?.click()}
          onSelectHistory={onSelectHistory}
          onDownload={(url) => void handleDownload(url)}
          onOpenLightbox={(url) => setLightboxUrl(url)}
          onReusePrompt={(tags) => {
            if (tags?.length) onPromptChange(tags.join(', '));
          }}
        />
      ) : isProductOnly ? (
        <DropZone
          dragging={garmentDragging}
          uploading={uploading}
          disabled={disabled}
          label={t('studio.productLabel')}
          emptyTitle={t('studio.uploadProduct')}
          emptyHint={t('studio.dropHint')}
          emptySubhint={
            studioMode === 'packshot'
              ? t('studio.modePackshotDesc')
              : t('studio.productOnlyHint')
          }
          previewUrl={hasGarment ? garmentPreviewUrl : null}
          exampleFan={
            studioMode === 'product-to-model'
              ? PRODUCT_TO_MODEL_FAN
              : studioMode === 'packshot'
                ? PACKSHOT_FAN
                : undefined
          }
          onExamplePick={
            studioMode === 'product-to-model'
              ? (url) => {
                  const garmentUrl = url.includes('sample-result')
                    ? PRODUCT_TO_MODEL_SAMPLE_PRODUCT
                    : url;
                  void handleFanGarmentPick(garmentUrl);
                }
              : studioMode === 'packshot'
                ? (url) => {
                    const garmentUrl = url.includes('packshot-after')
                      ? PACKSHOT_SAMPLE_PRODUCT
                      : url;
                    void handleFanGarmentPick(garmentUrl);
                  }
                : undefined
          }
          error={garmentFileError}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setGarmentDragging(true);
          }}
          onDragLeave={() => setGarmentDragging(false)}
          onDrop={onGarmentDrop}
          onBrowse={() => garmentInputRef.current?.click()}
          onReplace={() => garmentInputRef.current?.click()}
          onClear={onGarmentClear}
          fillStage
        />
      ) : (
        /* Side-by-side from the smallest phones — stacking wastes the dock/tab viewport */
        <div className="studio-stage grid min-h-0 grid-cols-2 gap-1.5 sm:gap-3">
          <DropZone
            dragging={garmentDragging}
            uploading={uploading}
            disabled={disabled}
            label={t('studio.productLabel')}
            emptyTitle={t('studio.uploadGarment')}
            emptyHint={t('studio.dropHint')}
            previewUrl={hasGarment ? garmentPreviewUrl : null}
            exampleFan={TRYON_PRODUCT_FAN}
            error={garmentFileError}
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setGarmentDragging(true);
            }}
            onDragLeave={() => setGarmentDragging(false)}
            onDrop={onGarmentDrop}
            onBrowse={() => garmentInputRef.current?.click()}
            onReplace={() => garmentInputRef.current?.click()}
            onClear={onGarmentClear}
            showCornerThumb
            stretch
            compact
          />

          <div className="glass-panel relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl">
            <p className="absolute left-2 top-2 z-10 text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:left-4 sm:top-4 sm:text-[11px] sm:tracking-[0.16em]">
              {t('studio.modelLabel')}
            </p>

            {hasModel && modelPreviewUrl ? (
              <>
                <img
                  src={modelPreviewUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/25 via-transparent to-white/10" />
                <div className="absolute right-1.5 top-1.5 z-10 flex gap-1 sm:right-3 sm:top-3 sm:gap-1.5">
                  <IconButton
                    disabled={disabled}
                    onClick={() => humanInputRef.current?.click()}
                    label={t('ecommerce.replace')}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    disabled={disabled}
                    onClick={() => {
                      onHumanClear();
                      onModelClear();
                    }}
                    label={t('ecommerce.remove')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 bg-zinc-50/30 px-1.5 pb-3 pt-7 sm:gap-4 sm:px-4 sm:pb-5 sm:pt-12">
                <ExampleFan
                  images={TRYON_MODEL_FAN}
                  onPick={(url) => void handleFanModelPick(url)}
                  disabled={disabled}
                  compact
                />
                <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-2">
                  <ActionChip disabled={disabled} onClick={() => void handlePasteModel()} compact>
                    {t('studio.paste')}
                  </ActionChip>
                  <ActionChip
                    disabled={disabled}
                    onClick={() => humanInputRef.current?.click()}
                    compact
                  >
                    {t('studio.upload')}
                  </ActionChip>
                </div>
                <p className="hidden max-w-[16rem] text-center text-[11px] leading-snug text-zinc-400 sm:block sm:max-w-xs sm:text-xs">
                  {t('studio.stepPersonHint')}
                </p>
              </div>
            )}

            {humanFileError ? (
              <p className="absolute bottom-2 left-1.5 right-1.5 z-10 rounded-xl border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] text-rose-700 backdrop-blur-md sm:bottom-3 sm:left-3 sm:right-3 sm:px-3 sm:py-2 sm:text-xs">
                {humanFileError}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Control dock — sticky chat-style input above iOS tab bar on phones */}
      <div
        ref={studioDockRef}
        className="studio-dock-mobile fixed inset-x-0 z-40 border-t border-zinc-200/80 bg-white/95 px-2 pt-2 shadow-[0_-12px_40px_rgb(24_24_27/0.08)] backdrop-blur-xl sm:px-3 sm:pt-2.5 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
      >
        <div className="glass-panel mx-auto w-full max-w-6xl rounded-2xl border border-zinc-200/60 bg-white/90 p-2 shadow-xl shadow-zinc-200/40 sm:p-3 lg:rounded-3xl lg:bg-white/70 lg:p-4">
          <LayoutGroup>
            <div className="relative mb-2 flex gap-0.5 overflow-x-auto scrollbar-none rounded-xl border border-zinc-200/60 bg-zinc-100/80 p-0.5 snap-x snap-mandatory sm:mb-2.5 sm:gap-1 sm:rounded-2xl sm:p-1 lg:mb-3 lg:flex-wrap lg:overflow-visible lg:snap-none">
              {MODE_ORDER.map((mode) => {
                const meta = modeMeta[mode];
                const active = studioMode === mode;
                return (
                  <ModeTab
                    key={mode}
                    active={active}
                    onClick={() => onStudioModeChange?.(mode)}
                    icon={meta.icon}
                    label={meta.label}
                    example={meta.example}
                  />
                );
              })}
            </div>
          </LayoutGroup>

          <div className="flex items-end gap-1.5 sm:gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={`group relative rounded-xl border bg-white transition sm:rounded-2xl ${
                  disabled && !running
                    ? 'border-zinc-200/60 opacity-60'
                    : 'border-zinc-200/60 focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10'
                }`}
              >
                <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400 sm:left-3.5">
                  <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <input
                  type="text"
                  value={prompt}
                  disabled={disabled && !running}
                  onChange={(e) => onPromptChange(e.target.value)}
                  enterKeyHint="go"
                  autoComplete="off"
                  autoCorrect="off"
                  placeholder={
                    studioMode === 'product-to-model'
                      ? t('studio.productToModelPromptPlaceholder')
                      : studioMode === 'packshot'
                        ? t('studio.packshotPromptPlaceholder')
                        : t('studio.promptPlaceholder')
                  }
                  className="w-full rounded-xl bg-transparent py-2.5 pl-8 pr-2.5 text-[15px] text-zinc-900 placeholder:text-zinc-400 outline-none disabled:cursor-not-allowed sm:rounded-2xl sm:py-3.5 sm:pl-10 sm:pr-3 sm:text-base lg:text-sm"
                />
              </div>
            </div>

            <motion.button
              type="button"
              onClick={onRun}
              disabled={
                waitingInThisMode
                  ? false
                  : (!canRun || disabled || running)
              }
              aria-busy={waitingInThisMode}
              whileTap={waitingInThisMode ? undefined : { scale: 0.98 }}
              className={`run-btn-shimmer relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40 sm:h-12 sm:w-12 sm:rounded-2xl lg:h-12 lg:w-auto lg:min-w-[9rem] lg:gap-2 lg:px-6 lg:text-sm lg:font-semibold ${
                waitingInThisMode
                  ? 'bg-zinc-100 text-zinc-600'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {waitingInThisMode ? (
                <>
                  <span className="meditative-spinner !h-4 !w-4 sm:!h-5 sm:!w-5" />
                  <span className="hidden lg:inline">{runLabel}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current sm:h-4 sm:w-4" />
                  <span className="hidden lg:inline">{runLabel}</span>
                </>
              )}
            </motion.button>
          </div>

          <div className="mt-2 hidden flex-wrap gap-1.5 lg:flex">
            {STUDIO_PROMPT_PRESET_KEYS.map((key) => {
              const label = t(`studio.promptPresets.${key}`);
              const selected = selectedPromptPresets.includes(key);
              return (
                <motion.button
                  key={key}
                  type="button"
                  disabled={disabled && !running}
                  aria-pressed={selected}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => togglePromptPreset(key)}
                  className={
                    selected
                      ? 'inline-flex items-center gap-1.5 rounded-full border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition disabled:opacity-50'
                      : 'inline-flex items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50'
                  }
                >
                  <ImageIcon className="h-3 w-3 opacity-70" />
                  {label}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5 sm:mt-2.5 sm:gap-2">
            <StudioOutputControls
              settings={outputSettings}
              disabled={disabled && !running}
              onChange={(next) => onOutputSettingsChange?.(next)}
            />
          </div>

          {/* Mobile: horizontal preset chips under prompt */}
          <div className="mt-1.5 flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5 sm:mt-2 lg:hidden">
            {STUDIO_PROMPT_PRESET_KEYS.map((key) => {
              const label = t(`studio.promptPresets.${key}`);
              const selected = selectedPromptPresets.includes(key);
              return (
                <motion.button
                  key={key}
                  type="button"
                  disabled={disabled && !running}
                  aria-pressed={selected}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => togglePromptPreset(key)}
                  className={
                    selected
                      ? 'inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-900 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs'
                      : 'inline-flex shrink-0 items-center gap-1 rounded-full border border-zinc-200/60 bg-zinc-50 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition active:bg-zinc-100 disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-xs'
                  }
                >
                  {label}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function DropZone({
  dragging,
  uploading,
  disabled,
  label,
  emptyTitle,
  emptyHint,
  emptySubhint,
  previewUrl,
  exampleFan,
  onExamplePick,
  error,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onReplace,
  onClear,
  showCornerThumb,
  fillStage = false,
  stretch = false,
  compact = false,
}: {
  dragging: boolean;
  uploading: boolean;
  disabled: boolean;
  label: string;
  emptyTitle: string;
  emptyHint: string;
  emptySubhint?: string;
  previewUrl: string | null;
  exampleFan?: readonly string[];
  onExamplePick?: (url: string) => void;
  error: string | null;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  onReplace: () => void;
  onClear: () => void;
  showCornerThumb?: boolean;
  /** Own viewport-aware stage height (single-panel modes). */
  fillStage?: boolean;
  /** Stretch to parent stage grid cell (dual-panel try-on). */
  stretch?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  const sizeClass = fillStage
    ? 'studio-stage min-h-0'
    : stretch
      ? 'h-full min-h-0'
      : 'min-h-[168px] sm:min-h-[220px] md:min-h-[420px]';

  return (
    <motion.div
      animate={{
        scale: dragging ? 1.01 : 1,
        boxShadow: dragging
          ? '0 0 0 2px rgb(99 102 241 / 0.15), 0 8px 30px rgb(24 24 27 / 0.06)'
          : '0 0 0 1px rgb(228 228 231 / 0.6)',
      }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={`glass-panel relative overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl ${sizeClass}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <p
        className={`absolute z-10 font-semibold uppercase text-zinc-500 ${
          compact
            ? 'left-2 top-2 text-[9px] tracking-[0.12em] sm:left-4 sm:top-4 sm:text-[11px] sm:tracking-[0.16em]'
            : 'left-2.5 top-2.5 text-[10px] tracking-[0.14em] sm:left-4 sm:top-4 sm:text-[11px] sm:tracking-[0.16em]'
        }`}
      >
        {label}
      </p>

      {previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt=""
            className={`absolute inset-0 h-full w-full object-contain ${compact ? 'p-2 sm:p-8' : 'p-3 sm:p-8'}`}
          />
          {showCornerThumb ? (
            <div
              className={`absolute overflow-hidden rounded-lg border border-zinc-200/60 shadow-sm ${
                compact
                  ? 'left-2 top-2 h-9 w-7 sm:left-3 sm:top-3 sm:h-14 sm:w-11'
                  : 'left-2.5 top-2.5 h-11 w-9 sm:left-3 sm:top-3 sm:h-14 sm:w-11'
              }`}
            >
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div
            className={`absolute flex gap-1 ${
              compact ? 'right-1.5 top-1.5 sm:right-3 sm:top-3 sm:gap-1.5' : 'right-2 top-2 sm:right-3 sm:top-3 sm:gap-1.5'
            }`}
          >
            <IconButton disabled={disabled} onClick={onReplace} label={t('ecommerce.replace')}>
              <Pencil className="h-3.5 w-3.5" />
            </IconButton>
            <IconButton disabled={disabled} onClick={onClear} label={t('ecommerce.remove')}>
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={onBrowse}
          className={`flex h-full w-full flex-col items-center justify-center border-2 border-dashed border-zinc-300 bg-zinc-50/30 text-center transition hover:bg-zinc-100 active:bg-zinc-100 disabled:opacity-50 ${
            compact
              ? 'min-h-0 gap-1.5 px-1.5 pt-6 pb-2 sm:gap-3 sm:px-6 sm:pt-0 sm:pb-0'
              : fillStage || stretch
                ? 'min-h-0 gap-2 px-3 sm:gap-3 sm:px-6'
                : 'min-h-[168px] gap-2 px-3 sm:min-h-[220px] sm:gap-3 sm:px-6 md:min-h-[420px]'
          }`}
        >
          {uploading ? (
            <>
              <div className="relative flex h-12 w-12 items-center justify-center sm:h-16 sm:w-16">
                <span className="meditative-spinner" />
              </div>
              <span className="text-xs font-medium text-zinc-600 sm:text-sm">{t('studio.uploading')}</span>
              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-zinc-200 sm:mt-2 sm:h-2 sm:w-40">
                <div className="skeleton-shimmer h-full w-full rounded-full" />
              </div>
            </>
          ) : (
            <>
              {exampleFan?.length ? (
                <ExampleFan
                  images={exampleFan}
                  onPick={onExamplePick}
                  disabled={disabled}
                  compact={compact}
                />
              ) : (
                <motion.span
                  animate={{
                    scale: dragging ? 1.15 : 1,
                    color: dragging ? '#6366f1' : '#71717a',
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/30 sm:h-14 sm:w-14"
                >
                  <Upload className="h-5 w-5 sm:h-6 sm:w-6" />
                </motion.span>
              )}
              <span
                className={`rounded-full border border-zinc-200/60 bg-white font-semibold text-zinc-900 ${
                  compact
                    ? 'max-w-full truncate px-2 py-1 text-[10px] sm:px-4 sm:py-2 sm:text-sm'
                    : 'px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm'
                }`}
              >
                {emptyTitle}
              </span>
              <span
                className={`leading-snug text-zinc-500 ${
                  compact
                    ? 'hidden max-w-[9rem] text-[10px] sm:block sm:max-w-none sm:text-xs'
                    : 'max-w-[14rem] text-[11px] sm:max-w-none sm:text-xs'
                }`}
              >
                {emptyHint}
              </span>
              {emptySubhint ? (
                <span
                  className={`text-zinc-400 ${
                    compact
                      ? 'hidden max-w-[10rem] text-[10px] sm:block sm:max-w-sm sm:text-xs'
                      : 'max-w-sm text-[11px] sm:text-xs'
                  }`}
                >
                  {emptySubhint}
                </span>
              ) : null}
            </>
          )}
        </button>
      )}

      {error ? (
        <p
          className={`absolute z-10 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 backdrop-blur-md ${
            compact
              ? 'bottom-1.5 left-1.5 right-1.5 px-2 py-1 text-[10px] sm:bottom-3 sm:left-3 sm:right-3 sm:px-3 sm:py-2 sm:text-xs'
              : 'bottom-2 left-2 right-2 px-2.5 py-1.5 text-[11px] sm:bottom-3 sm:left-3 sm:right-3 sm:px-3 sm:py-2 sm:text-xs'
          }`}
        >
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}

function ExampleFan({
  images,
  onPick,
  disabled,
  compact = false,
}: {
  images: readonly string[];
  onPick?: (url: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const count = Math.min(images.length, 3);
  const rotations = count === 2 ? [-10, 10] : [-14, 0, 14];
  const offsets = compact
    ? (count === 2 ? [-14, 14] : [-20, 0, 20])
    : (count === 2 ? [-24, 24] : [-34, 0, 34]);

  return (
    <div
      className={
        compact
          ? 'relative mb-0.5 flex h-20 w-full max-w-[110px] items-center justify-center sm:mb-1 sm:h-40 sm:max-w-[220px]'
          : 'relative mb-0.5 flex h-28 w-full max-w-[170px] items-center justify-center sm:mb-1 sm:h-40 sm:max-w-[220px]'
      }
    >
      {images.slice(0, 3).map((src, index) => {
        const interactive = Boolean(onPick);
        const className = compact
          ? 'absolute h-16 w-11 overflow-hidden rounded-md border border-white bg-zinc-100 shadow-lg shadow-zinc-300/50 sm:h-36 sm:w-20 sm:rounded-xl'
          : 'absolute h-24 w-[3.5rem] overflow-hidden rounded-lg border border-white bg-zinc-100 shadow-lg shadow-zinc-300/50 sm:h-36 sm:w-20 sm:rounded-xl';
        const style = {
          transform: `translateX(${offsets[index] ?? 0}px) rotate(${rotations[index] ?? 0}deg)`,
          zIndex: count === 2 ? index + 1 : index === 1 ? 3 : 1,
        };

        if (interactive) {
          return (
            <button
              key={src}
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                onPick?.(src);
              }}
              className={`${className} transition hover:-translate-y-1 hover:shadow-xl disabled:opacity-50`}
              style={style}
            >
              <img src={src} alt="" className="h-full w-full object-cover object-top" />
            </button>
          );
        }

        return (
          <div key={src} className={className} style={style}>
            <img src={src} alt="" className="h-full w-full object-cover object-top" />
          </div>
        );
      })}
    </div>
  );
}

function SessionLayout({
  stageRef,
  garmentPreviewUrl,
  modelPreviewUrl,
  showModelThumb = true,
  running,
  disabled,
  resultImageUrl,
  resultVariantUrls = [],
  onSelectVariant,
  historyItems,
  activeResultUrl,
  downloading,
  historyOpen,
  onToggleHistory,
  onBackToSetup,
  onReplaceGarment,
  onReplaceModel,
  onSelectHistory,
  onDownload,
  onOpenLightbox,
  onReusePrompt,
}: {
  stageRef?: RefObject<HTMLDivElement | null>;
  garmentPreviewUrl: string | null;
  modelPreviewUrl: string | null;
  showModelThumb?: boolean;
  running: boolean;
  disabled: boolean;
  resultImageUrl: string | null;
  resultVariantUrls?: string[];
  onSelectVariant?: (url: string) => void;
  historyItems: TryOnHistoryItem[];
  activeResultUrl: string | null;
  downloading: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  onBackToSetup?: () => void;
  onReplaceGarment: () => void;
  onReplaceModel: () => void;
  onSelectHistory?: (item: TryOnHistoryItem) => void;
  onDownload: (url?: string | null) => void;
  onOpenLightbox: (url: string) => void;
  onReusePrompt: (tags?: string[]) => void;
}) {
  const { t } = useTranslation();
  const locked = running || disabled;
  const variantUrls = resultVariantUrls.length > 1
    ? resultVariantUrls
    : [];

  return (
    <div
      ref={stageRef}
      className={`studio-stage studio-stage-session flex min-h-0 min-w-0 flex-col gap-1.5 md:grid md:min-h-[460px] md:gap-3 ${
        historyOpen
          ? 'md:grid-cols-[88px_minmax(0,1fr)_120px]'
          : 'md:grid-cols-[88px_minmax(0,1fr)_48px]'
      }`}
    >
      {/* Desktop / tablet side rail */}
      <div className="hidden flex-col gap-3 md:flex">
        {onBackToSetup ? (
          <button
            type="button"
            disabled={locked}
            onClick={onBackToSetup}
            className="inline-flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('studio.back')}
          </button>
        ) : null}

        <InputThumb
          label={t('studio.productLabel')}
          src={garmentPreviewUrl}
          disabled={locked}
          onClick={onReplaceGarment}
        />
        {showModelThumb ? (
          <InputThumb
            label={t('studio.modelLabel')}
            src={modelPreviewUrl}
            disabled={locked}
            onClick={onReplaceModel}
          />
        ) : null}
      </div>

      <div className="glass-panel relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl md:min-h-[460px]">
        {/* Mobile: compact overlays so animation/result fills the stage */}
        <div className="absolute left-2 top-2 z-20 flex items-start gap-1.5 md:hidden">
          {onBackToSetup ? (
            <button
              type="button"
              disabled={locked}
              onClick={onBackToSetup}
              aria-label={t('studio.back')}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200/70 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition hover:bg-white disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <InputThumb
            label={t('studio.productLabel')}
            src={garmentPreviewUrl}
            disabled={locked}
            onClick={onReplaceGarment}
            compact
          />
          {showModelThumb ? (
            <InputThumb
              label={t('studio.modelLabel')}
              src={modelPreviewUrl}
              disabled={locked}
              onClick={onReplaceModel}
              compact
            />
          ) : null}
        </div>

        {running ? (
          <GenerationWaitingShowcase />
        ) : resultImageUrl ? (
          <>
            <img
              src={resultImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div className="absolute right-3 top-3 z-10 flex gap-1.5">
              <IconButton
                disabled={locked}
                onClick={onReplaceGarment}
                label={t('ecommerce.replace')}
              >
                <Pencil className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                disabled={locked}
                onClick={() => onOpenLightbox(resultImageUrl)}
                label={t('studio.openLightbox')}
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </IconButton>
            </div>
            <div className="absolute bottom-3 right-3 z-10">
              <IconButton
                disabled={downloading || locked}
                onClick={() => onDownload(resultImageUrl)}
                label={t('preview.download')}
              >
                {downloading ? (
                  <span className="meditative-spinner !h-4 !w-4" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
              </IconButton>
            </div>
            {variantUrls.length > 0 ? (
              <div className="absolute bottom-3 left-3 z-10 flex gap-1.5 rounded-2xl border border-zinc-200/70 bg-white/90 p-1.5 shadow-sm backdrop-blur-md">
                {variantUrls.map((url, index) => {
                  const thumb = resolveImageUrl(url);
                  const active = url === activeResultUrl || resolveImageUrl(url) === resultImageUrl;
                  return (
                    <button
                      key={`${url.slice(0, 48)}-${index}`}
                      type="button"
                      disabled={locked}
                      onClick={() => onSelectVariant?.(url)}
                      aria-label={t('studio.variantN', { n: index + 1 })}
                      aria-pressed={active}
                      className={`h-14 w-10 overflow-hidden rounded-xl border transition ${
                        active
                          ? 'border-zinc-900 ring-2 ring-zinc-900/20'
                          : 'border-zinc-200/80 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <img src={thumb || url} alt="" className="h-full w-full object-cover object-top" />
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="glass-panel hidden flex-col rounded-2xl border border-zinc-200/60 bg-white/70 p-2 shadow-sm md:flex">
        <button
          type="button"
          onClick={onToggleHistory}
          className="mb-2 flex items-center justify-between gap-1 rounded-lg px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 transition hover:text-zinc-700"
          aria-expanded={historyOpen}
          aria-label={historyOpen ? t('studio.historyCollapse') : t('studio.historyExpand')}
        >
          <span>{t('studio.history')}</span>
          {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>

        <AnimatePresence initial={false}>
          {historyOpen ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 scrollbar-none md:max-h-[420px] md:snap-none md:flex-col md:overflow-y-auto md:overflow-x-hidden md:pb-0">
                {running ? (
                  <div className="flex h-28 w-20 shrink-0 snap-start flex-col items-center justify-center rounded-xl border border-zinc-200/60 bg-zinc-50 md:w-full">
                    <span className="meditative-spinner !h-5 !w-5" />
                    <span className="mt-1 text-[10px] font-semibold text-zinc-500">
                      {t('studio.running')}
                    </span>
                  </div>
                ) : null}

                {historyItems.map((item) => {
                  const active = item.imageUrl === activeResultUrl;
                  const thumb = resolveImageUrl(item.imageUrl);
                  return (
                    <div
                      key={item.id}
                      className={`group relative h-28 w-20 shrink-0 snap-start overflow-hidden rounded-xl border transition md:w-full ${
                        active
                          ? 'border-indigo-500/50 ring-2 ring-indigo-500/10'
                          : 'border-zinc-200/60 hover:border-zinc-300'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={running}
                        onClick={() => onSelectHistory?.(item)}
                        className="absolute inset-0 disabled:opacity-60"
                      >
                        {thumb ? (
                          <img src={thumb} alt="" className="h-full w-full object-cover object-top" />
                        ) : null}
                      </button>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-0 items-center justify-center gap-1 bg-gradient-to-t from-white/95 to-transparent p-1.5 opacity-100 transition lg:translate-y-1 lg:opacity-0 lg:group-hover:translate-y-0 lg:group-hover:opacity-100 lg:group-focus-within:translate-y-0 lg:group-focus-within:opacity-100">
                        <HistoryAction
                          label={t('preview.download')}
                          onClick={() => onDownload(item.imageUrl)}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </HistoryAction>
                        {thumb ? (
                          <HistoryAction
                            label={t('studio.openLightbox')}
                            onClick={() => onOpenLightbox(thumb)}
                          >
                            <Maximize2 className="h-3.5 w-3.5" />
                          </HistoryAction>
                        ) : null}
                        <HistoryAction
                          label={t('studio.reusePrompt')}
                          onClick={() => onReusePrompt(item.hashtags)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </HistoryAction>
                      </div>
                    </div>
                  );
                })}

                {!running && historyItems.length === 0 ? (
                  <p className="px-1 py-4 text-center text-[11px] text-zinc-400">
                    {t('studio.historyEmpty')}
                  </p>
                ) : null}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function GenerationWaitingShowcase() {
  const { t } = useTranslation();
  const [frameIndex, setFrameIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const frameTimer = window.setInterval(() => {
      setFrameIndex((i) => (i + 1) % GENERATION_WAIT_FRAMES.length);
    }, FRAME_MS);
    const tipTimer = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % WAIT_TIP_KEYS.length);
    }, TIP_MS);
    return () => {
      window.clearInterval(frameTimer);
      window.clearInterval(tipTimer);
    };
  }, []);

  const src = GENERATION_WAIT_FRAMES[frameIndex];

  return (
    <div className="absolute inset-0 bg-zinc-100">
      <AnimatePresence mode="sync" initial={false}>
        <motion.img
          key={src}
          src={src}
          alt=""
          initial={{ opacity: 0, scale: 1.06 }}
          animate={{ opacity: 1, scale: 1.12 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{
            opacity: { duration: 0.7, ease: 'easeInOut' },
            scale: { duration: FRAME_MS / 1000, ease: 'linear' },
          }}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-zinc-900/55 via-zinc-900/10 to-zinc-900/20" />

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-2 px-4 pb-5 pt-12 text-center sm:gap-3 sm:px-6 sm:pb-7 sm:pt-16">
        <div className="flex items-center gap-2 rounded-full border border-white/25 bg-white/15 px-3 py-1.5 backdrop-blur-md sm:gap-2.5 sm:px-3.5">
          <span className="meditative-spinner !h-4 !w-4 !border-2 !border-white/30 !border-t-white" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/90 sm:text-xs">
            {t('studio.running')}
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={WAIT_TIP_KEYS[tipIndex]}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35 }}
            className="max-w-sm text-xs font-medium text-white/90 sm:text-sm"
          >
            {t(WAIT_TIP_KEYS[tipIndex])}
          </motion.p>
        </AnimatePresence>

        <div className="h-1 w-40 overflow-hidden rounded-full bg-white/20">
          <motion.div
            className="h-full rounded-full bg-white/80"
            initial={{ x: '-100%' }}
            animate={{ x: '100%' }}
            transition={{ duration: 1.6, ease: 'easeInOut', repeat: Infinity }}
            style={{ width: '45%' }}
          />
        </div>

        <div className="flex gap-1.5">
          {GENERATION_WAIT_FRAMES.map((frame, i) => (
            <span
              key={frame}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === frameIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/35'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function HistoryAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
    >
      {children}
    </button>
  );
}

function InputThumb({
  label,
  src,
  onClick,
  disabled,
  compact = false,
}: {
  label: string;
  src: string | null;
  onClick: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`group flex shrink-0 flex-col disabled:opacity-50 md:w-full ${
        compact
          ? 'w-11 gap-0.5 rounded-xl border border-white/40 bg-white/85 p-1 shadow-sm backdrop-blur-md'
          : 'w-20 gap-1'
      }`}
    >
      <span
        className={`font-semibold uppercase tracking-[0.12em] ${
          compact ? 'px-0.5 text-[8px] text-zinc-600' : 'text-[10px] text-zinc-500'
        }`}
      >
        {label}
      </span>
      <span className={`relative aspect-[3/4] w-full overflow-hidden border border-zinc-200/60 bg-zinc-50 shadow-sm transition group-hover:border-zinc-300 group-hover:shadow-md group-hover:shadow-zinc-200/50 ${
        compact ? 'rounded-lg' : 'rounded-xl'
      }`}
      >
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover object-top" />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-400">
            —
          </span>
        )}
      </span>
    </button>
  );
}

function ModeTab({
  active,
  disabled,
  onClick,
  icon,
  label,
  example,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  example?: {
    before?: string;
    after?: string;
    image?: string;
    titleKey: string;
    descriptionKey: string;
  };
}) {
  const { t } = useTranslation();
  const hasSplit = Boolean(example?.before && example?.after);
  const hasSingle = Boolean(example?.image);
  const showPreview = Boolean(example && (hasSplit || hasSingle || example.descriptionKey));

  return (
    <div className="group relative min-w-[5.75rem] shrink-0 snap-start flex-1 sm:min-w-[7rem] lg:min-w-0">
      {showPreview && example ? (
        <div
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-3 hidden w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 opacity-0 transition duration-150 group-hover:opacity-100 group-focus-within:opacity-100 lg:block"
          role="tooltip"
        >
          <div className="overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 backdrop-blur-xl">
            {hasSplit ? (
              <div className="relative aspect-[4/3] bg-zinc-50">
                <div className="absolute inset-0 grid grid-cols-2">
                  <img src={example.before} alt="" className="h-full w-full object-cover object-top" />
                  <img src={example.after} alt="" className="h-full w-full object-cover object-top" />
                </div>
                <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-zinc-900 backdrop-blur-sm">
                  {t(example.titleKey)}
                </span>
              </div>
            ) : hasSingle ? (
              <div className="relative aspect-[4/3] bg-zinc-50">
                <img src={example.image} alt="" className="h-full w-full object-contain p-4" />
                <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-zinc-200/60 bg-white/90 px-3 py-1 text-[11px] font-semibold text-zinc-900 backdrop-blur-sm">
                  {t(example.titleKey)}
                </span>
              </div>
            ) : null}
            <p className="px-3.5 py-3 text-left text-xs leading-relaxed text-zinc-500">
              {t(example.descriptionKey)}
            </p>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={`relative z-10 flex w-full items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition disabled:opacity-50 sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-sm ${
          active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        {active ? (
          <motion.span
            layoutId="studio-mode-pill"
            className="absolute inset-0 rounded-lg border border-zinc-200/50 bg-white shadow-sm sm:rounded-xl"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        ) : null}
        <span className="relative z-10 flex min-w-0 items-center gap-1 sm:gap-2">
          <span className="hidden sm:inline-flex">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
      </button>
    </div>
  );
}

function ActionChip({
  children,
  onClick,
  disabled,
  active,
  compact = false,
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border font-semibold transition disabled:opacity-50 ${
        compact
          ? 'px-2 py-1 text-[10px] sm:px-4 sm:py-2 sm:text-sm'
          : 'px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm'
      } ${
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200/60 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}

function AspectRatioGlyph({ ratio }: { ratio: string }) {
  const [w, h] = ratio.split(':').map(Number);
  const safeW = w > 0 ? w : 1;
  const safeH = h > 0 ? h : 1;
  const max = 14;
  const scale = max / Math.max(safeW, safeH);
  const width = Math.max(6, Math.round(safeW * scale));
  const height = Math.max(6, Math.round(safeH * scale));

  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-[2px] border border-current opacity-70"
      style={{ width, height }}
    />
  );
}

function StudioMenuItem({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs transition sm:gap-2.5 sm:px-2.5 sm:text-sm ${
        active
          ? 'bg-zinc-100 text-zinc-900'
          : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
      }`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-zinc-900" /> : null}
    </button>
  );
}

function StudioChipButton({
  disabled,
  open,
  onClick,
  icon,
  label,
  ariaLabel,
}: {
  disabled?: boolean;
  open: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold transition disabled:opacity-50 sm:h-9 sm:gap-1.5 sm:rounded-xl sm:px-2.5 sm:text-xs ${
        open
          ? 'border-zinc-300 bg-zinc-100 text-zinc-900'
          : 'border-zinc-200/70 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
      }`}
    >
      <span className="text-zinc-400">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
      <ChevronDown className={`h-3 w-3 text-zinc-400 transition ${open ? 'rotate-180' : ''}`} />
    </button>
  );
}

function qualityModeLabel(
  mode: StudioQualityMode,
  t: (key: string) => string,
): string {
  switch (mode) {
    case 'auto':
      return t('studio.qualityModes.auto');
    case 'fast':
      return t('studio.qualityModes.fast');
    case 'balanced':
      return t('studio.qualityModes.balanced');
    case 'quality':
      return t('studio.qualityModes.quality');
    default:
      return mode;
  }
}

function qualityModeDesc(
  mode: StudioQualityMode,
  t: (key: string) => string,
): string {
  switch (mode) {
    case 'auto':
      return t('studio.qualityModes.autoDesc');
    case 'fast':
      return t('studio.qualityModes.fastDesc');
    case 'balanced':
      return t('studio.qualityModes.balancedDesc');
    case 'quality':
      return t('studio.qualityModes.qualityDesc');
    default:
      return '';
  }
}

function qualityModeIcon(mode: StudioQualityMode) {
  switch (mode) {
    case 'auto':
      return <Settings2 className="h-4 w-4 text-zinc-400" />;
    case 'fast':
      return <Zap className="h-4 w-4 text-zinc-400" />;
    case 'balanced':
      return <Scale className="h-4 w-4 text-zinc-400" />;
    case 'quality':
      return <Gem className="h-4 w-4 text-zinc-400" />;
    default:
      return <SlidersHorizontal className="h-4 w-4 text-zinc-400" />;
  }
}

type StudioMenuCoords = {
  left?: number;
  right?: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

function StudioSettingGroup({
  open,
  onClose,
  align = 'left',
  trigger,
  children,
}: {
  open: boolean;
  onClose: () => void;
  align?: 'left' | 'right';
  trigger: ReactNode;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<StudioMenuCoords | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }

    function updatePosition() {
      const triggerEl = triggerRef.current;
      if (!triggerEl) return;

      const rect = triggerEl.getBoundingClientRect();
      const gap = 8;
      const viewportPad = 10;
      const maxWidth = Math.min(18 * 16, window.innerWidth - viewportPad * 2);
      const minWidth = Math.min(Math.max(rect.width, 10 * 16), maxWidth);

      const spaceAbove = rect.top - viewportPad;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const openAbove = spaceAbove >= Math.min(22 * 16, spaceBelow) || spaceAbove > spaceBelow;
      const available = openAbove ? spaceAbove - gap : spaceBelow - gap;
      const maxHeight = Math.max(8 * 16, Math.min(available, Math.min(50 * (window.innerHeight / 100), 22 * 16)));

      const next: StudioMenuCoords = {
        minWidth,
        maxWidth,
        maxHeight,
      };

      if (align === 'right') {
        next.right = Math.max(viewportPad, window.innerWidth - rect.right);
      } else {
        next.left = Math.max(viewportPad, Math.min(rect.left, window.innerWidth - minWidth - viewportPad));
      }

      if (openAbove) {
        next.bottom = window.innerHeight - rect.top + gap;
      } else {
        next.top = rect.bottom + gap;
      }

      setCoords(next);
    }

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      onClose();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  return (
    <>
      <div ref={triggerRef} className="relative shrink-0">
        {trigger}
      </div>
      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              className="fixed z-[80] overflow-y-auto overflow-x-hidden rounded-2xl border border-zinc-200/80 bg-white p-1.5 shadow-xl shadow-zinc-200/60"
              style={{
                left: coords.left,
                right: coords.right,
                minWidth: coords.minWidth,
                maxWidth: coords.maxWidth,
                maxHeight: coords.maxHeight,
                top: coords.top,
                bottom: coords.bottom,
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function StudioOutputControls({
  settings,
  disabled,
  onChange,
}: {
  settings: StudioOutputSettings;
  disabled?: boolean;
  onChange: (next: StudioOutputSettings) => void;
}) {
  const { t } = useTranslation();
  const [openMenu, setOpenMenu] = useState<'ratio' | 'resolution' | 'mode' | 'variants' | null>(null);

  function patch(partial: Partial<StudioOutputSettings>) {
    onChange({ ...settings, ...partial });
    setOpenMenu(null);
  }

  const closeMenu = () => setOpenMenu(null);

  const modeTriggerLabel = settings.qualityMode === 'auto'
    ? t('studio.mode')
    : qualityModeLabel(settings.qualityMode, t);

  const resolutionTriggerLabel = settings.resolution === 'auto'
    ? t('studio.resolution')
    : resolutionLabel(settings.resolution);

  const variantsTriggerLabel = settings.numImages === 3
    ? t('studio.variantsThree')
    : t('studio.variantsOne');

  return (
    <>
      <StudioSettingGroup
        open={openMenu === 'ratio'}
        onClose={closeMenu}
        trigger={(
          <StudioChipButton
            disabled={disabled}
            open={openMenu === 'ratio'}
            onClick={() => setOpenMenu((v) => (v === 'ratio' ? null : 'ratio'))}
            icon={<AspectRatioGlyph ratio={settings.aspectRatio} />}
            label={settings.aspectRatio}
            ariaLabel={t('studio.ratio')}
          />
        )}
      >
        {STUDIO_ASPECT_RATIOS.map((ratio) => (
          <StudioMenuItem
            key={ratio}
            active={settings.aspectRatio === ratio}
            onClick={() => patch({ aspectRatio: ratio as StudioAspectRatio })}
          >
            <span className="flex items-center gap-2.5">
              <AspectRatioGlyph ratio={ratio} />
              <span className="font-medium text-zinc-900">{ratio}</span>
            </span>
          </StudioMenuItem>
        ))}
      </StudioSettingGroup>

      <StudioSettingGroup
        open={openMenu === 'resolution'}
        onClose={closeMenu}
        trigger={(
          <StudioChipButton
            disabled={disabled}
            open={openMenu === 'resolution'}
            onClick={() => setOpenMenu((v) => (v === 'resolution' ? null : 'resolution'))}
            icon={<Grid2x2 className="h-3.5 w-3.5" />}
            label={resolutionTriggerLabel}
            ariaLabel={t('studio.resolution')}
          />
        )}
      >
        {STUDIO_RESOLUTIONS.map((value) => (
          <StudioMenuItem
            key={value}
            active={settings.resolution === value}
            onClick={() => patch({ resolution: value as StudioResolution })}
          >
            <span className="font-medium text-zinc-900">{resolutionMenuLabel(value)}</span>
          </StudioMenuItem>
        ))}
      </StudioSettingGroup>

      <StudioSettingGroup
        open={openMenu === 'variants'}
        onClose={closeMenu}
        trigger={(
          <StudioChipButton
            disabled={disabled}
            open={openMenu === 'variants'}
            onClick={() => setOpenMenu((v) => (v === 'variants' ? null : 'variants'))}
            icon={<Layers className="h-3.5 w-3.5" />}
            label={variantsTriggerLabel}
            ariaLabel={t('studio.variants')}
          />
        )}
      >
        {STUDIO_VARIANT_COUNTS.map((count) => {
          const cost = creditCostForVariantCount(count);
          return (
            <StudioMenuItem
              key={count}
              active={settings.numImages === count}
              onClick={() => patch({ numImages: count as StudioVariantCount })}
            >
              <span className="flex w-full items-center justify-between gap-4">
                <span className="font-medium text-zinc-900">
                  {count === 3 ? t('studio.variantsThree') : t('studio.variantsOne')}
                </span>
                <span className="text-xs text-zinc-500">
                  {t('studio.creditsCost', { count: cost })}
                </span>
              </span>
            </StudioMenuItem>
          );
        })}
      </StudioSettingGroup>

      <StudioSettingGroup
        open={openMenu === 'mode'}
        onClose={closeMenu}
        align="right"
        trigger={(
          <StudioChipButton
            disabled={disabled}
            open={openMenu === 'mode'}
            onClick={() => setOpenMenu((v) => (v === 'mode' ? null : 'mode'))}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
            label={modeTriggerLabel}
            ariaLabel={t('studio.mode')}
          />
        )}
      >
        <div className="w-full min-w-[min(15rem,calc(100vw-1.5rem))]">
          {STUDIO_QUALITY_MODES.map((mode) => (
            <StudioMenuItem
              key={mode}
              active={settings.qualityMode === mode}
              onClick={() => patch({ qualityMode: mode as StudioQualityMode })}
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5">{qualityModeIcon(mode)}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                    {qualityModeLabel(mode, t)}
                    {mode === 'quality' ? (
                      <span className="rounded bg-zinc-900 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-white">
                        Pro
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal leading-snug text-zinc-500">
                    {qualityModeDesc(mode, t)}
                  </span>
                </span>
              </span>
            </StudioMenuItem>
          ))}
        </div>
      </StudioSettingGroup>
    </>
  );
}

function IconButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 sm:h-9 sm:w-9"
    >
      {children}
    </button>
  );
}
