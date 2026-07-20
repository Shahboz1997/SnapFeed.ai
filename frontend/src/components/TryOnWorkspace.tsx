import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  ImageIcon,
  Maximize2,
  Package,
  Pencil,
  Play,
  RefreshCw,
  Shirt,
  Sparkles,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { downloadImageBlob, triggerBlobDownload } from '../api/downloadImage';
import { STUDIO_MODE_EXAMPLES, TRYON_MODEL_FAN, TRYON_PRODUCT_FAN } from '../constants/studioModeExamples';
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
  resultImageUrl?: string | null;
  historyItems?: TryOnHistoryItem[];
  onSelectHistory?: (item: TryOnHistoryItem) => void;
  onBackToSetup?: () => void;
  onNotify?: (message: string, type: 'success' | 'warning' | 'error') => void;
};

const PROMPT_PRESET_KEYS = [
  'studioLight',
  'softShadows',
  'lookbook',
  'fullBody',
  'cleanBg',
  'naturalFit',
] as const;

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
  resultImageUrl = null,
  historyItems = [],
  onSelectHistory,
  onBackToSetup,
  onNotify,
}: TryOnWorkspaceProps) {
  const { t } = useTranslation();
  const garmentInputRef = useRef<HTMLInputElement>(null);
  const humanInputRef = useRef<HTMLInputElement>(null);
  const [garmentDragging, setGarmentDragging] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const isProductOnly = studioMode === 'packshot' || studioMode === 'product-to-model';

  const modelPreviewUrl = humanPreviewUrl || selectedModelUrl;
  const hasGarment = Boolean(garmentBase64 || garmentPreviewUrl);
  const hasModel = Boolean(humanBase64 || selectedModelUrl);
  const inSession = running || Boolean(resultImageUrl);
  const displayResultUrl = resolveImageUrl(resultImageUrl);

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

  function appendPreset(label: string) {
    const trimmed = prompt.trim();
    if (!trimmed) {
      onPromptChange(label);
      return;
    }
    if (trimmed.toLowerCase().includes(label.toLowerCase())) return;
    onPromptChange(`${trimmed}, ${label}`);
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
    <div className="flex w-full flex-col gap-4">
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
          garmentPreviewUrl={garmentPreviewUrl}
          modelPreviewUrl={isProductOnly ? null : modelPreviewUrl}
          showModelThumb={!isProductOnly}
          running={running}
          disabled={disabled}
          resultImageUrl={displayResultUrl}
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
          emptySubhint={t('studio.productOnlyHint')}
          previewUrl={hasGarment ? garmentPreviewUrl : null}
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
        />
      ) : (
        <div className="grid min-h-0 grid-cols-1 gap-2.5 sm:gap-3 md:min-h-[420px] md:grid-cols-2">
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
          />

          <div className="glass-panel relative flex min-h-[240px] flex-col overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl md:min-h-[420px]">
            <p className="absolute left-4 top-4 z-10 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
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
                <div className="absolute right-3 top-3 z-10 flex gap-1.5">
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
              <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50/30 px-4 pb-5 pt-12">
                <ExampleFan
                  images={TRYON_MODEL_FAN}
                  onPick={(url) => void handleFanModelPick(url)}
                  disabled={disabled}
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <ActionChip disabled={disabled} onClick={() => void handlePasteModel()}>
                    {t('studio.paste')}
                  </ActionChip>
                  <ActionChip
                    disabled={disabled}
                    onClick={() => humanInputRef.current?.click()}
                  >
                    {t('studio.upload')}
                  </ActionChip>
                </div>
                <p className="max-w-xs text-center text-xs text-zinc-400">
                  {t('studio.stepPersonHint')}
                </p>
              </div>
            )}

            {humanFileError ? (
              <p className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 backdrop-blur-md">
                {humanFileError}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* Control dock — sticky chat-style input above iOS tab bar on phones */}
      <div className="studio-dock-mobile fixed inset-x-0 z-40 border-t border-zinc-200/80 bg-white/95 px-3 pt-2.5 shadow-[0_-12px_40px_rgb(24_24_27/0.08)] backdrop-blur-xl lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
        <div className="glass-panel mx-auto w-full max-w-6xl rounded-2xl border border-zinc-200/60 bg-white/90 p-2.5 shadow-xl shadow-zinc-200/40 sm:p-3 lg:rounded-3xl lg:bg-white/70 lg:p-4">
          <LayoutGroup>
            <div className="relative mb-2.5 flex gap-1 overflow-x-auto scrollbar-none rounded-2xl border border-zinc-200/60 bg-zinc-100/80 p-1 snap-x snap-mandatory lg:mb-3 lg:flex-wrap lg:overflow-visible lg:snap-none">
              {MODE_ORDER.map((mode) => {
                const meta = modeMeta[mode];
                const active = studioMode === mode;
                return (
                  <ModeTab
                    key={mode}
                    active={active}
                    disabled={disabled || running}
                    onClick={() => onStudioModeChange?.(mode)}
                    icon={meta.icon}
                    label={meta.label}
                    example={meta.example}
                  />
                );
              })}
            </div>
          </LayoutGroup>

          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <div
                className={`group relative rounded-2xl border bg-white transition ${
                  disabled && !running
                    ? 'border-zinc-200/60 opacity-60'
                    : 'border-zinc-200/60 focus-within:border-indigo-500/50 focus-within:ring-4 focus-within:ring-indigo-500/10'
                }`}
              >
                <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
                  <Sparkles className="h-4 w-4" />
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
                  className="w-full rounded-2xl bg-transparent py-3.5 pl-10 pr-3 text-base text-zinc-900 placeholder:text-zinc-400 outline-none disabled:cursor-not-allowed lg:text-sm"
                />
              </div>
            </div>

            <motion.button
              type="button"
              onClick={onRun}
              disabled={(!canRun && !running) || (disabled && !running)}
              aria-busy={running}
              whileTap={running ? undefined : { scale: 0.98 }}
              className={`run-btn-shimmer relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-40 lg:h-12 lg:w-auto lg:min-w-[9rem] lg:gap-2 lg:px-6 lg:text-sm lg:font-semibold ${
                running
                  ? 'bg-zinc-100 text-zinc-600'
                  : 'bg-zinc-900 text-white hover:bg-zinc-800'
              }`}
            >
              {running ? (
                <>
                  <span className="meditative-spinner !h-5 !w-5" />
                  <span className="hidden lg:inline">{runLabel}</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" />
                  <span className="hidden lg:inline">{runLabel}</span>
                </>
              )}
            </motion.button>
          </div>

          <div className="mt-2 hidden flex-wrap gap-1.5 lg:flex">
            {PROMPT_PRESET_KEYS.map((key) => {
              const label = t(`studio.promptPresets.${key}`);
              return (
                <motion.button
                  key={key}
                  type="button"
                  disabled={disabled && !running}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => appendPreset(label)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200/60 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
                >
                  <ImageIcon className="h-3 w-3 opacity-70" />
                  {label}
                </motion.button>
              );
            })}
          </div>

          <div className="mt-2.5 hidden flex-wrap gap-2 lg:flex">
            <MetaPill label={t('studio.ratio')} value="3:4" />
            <MetaPill label={t('studio.resolution')} value="1K" />
            <MetaPill label={t('studio.mode')} value={t('studio.modeFast')} />
            <MetaPill label="#" value="1" />
          </div>

          {/* Mobile: horizontal preset chips under prompt */}
          <div className="mt-2 flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5 lg:hidden">
            {PROMPT_PRESET_KEYS.map((key) => {
              const label = t(`studio.promptPresets.${key}`);
              return (
                <motion.button
                  key={key}
                  type="button"
                  disabled={disabled && !running}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => appendPreset(label)}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-200/60 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 transition active:bg-zinc-100 disabled:opacity-50"
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
  error,
  onDragOver,
  onDragLeave,
  onDrop,
  onBrowse,
  onReplace,
  onClear,
  showCornerThumb,
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
  error: string | null;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onBrowse: () => void;
  onReplace: () => void;
  onClear: () => void;
  showCornerThumb?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <motion.div
      animate={{
        scale: dragging ? 1.01 : 1,
        boxShadow: dragging
          ? '0 0 0 2px rgb(99 102 241 / 0.15), 0 8px 30px rgb(24 24 27 / 0.06)'
          : '0 0 0 1px rgb(228 228 231 / 0.6)',
      }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="glass-panel relative min-h-[240px] overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl md:min-h-[420px]"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <p className="absolute left-3 top-3 z-10 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500 sm:left-4 sm:top-4 sm:text-[11px]">
        {label}
      </p>

      {previewUrl ? (
        <>
          <img
            src={previewUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-contain p-5 sm:p-8"
          />
          {showCornerThumb ? (
            <div className="absolute left-3 top-3 h-14 w-11 overflow-hidden rounded-lg border border-zinc-200/60 shadow-sm">
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : null}
          <div className="absolute right-3 top-3 flex gap-1.5">
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
          className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-2.5 border-2 border-dashed border-zinc-300 bg-zinc-50/30 px-4 text-center transition hover:bg-zinc-100 active:bg-zinc-100 disabled:opacity-50 sm:gap-3 sm:px-6 md:min-h-[420px]"
        >
          {uploading ? (
            <>
              <div className="relative flex h-16 w-16 items-center justify-center">
                <span className="meditative-spinner" />
              </div>
              <span className="text-sm font-medium text-zinc-600">{t('studio.uploading')}</span>
              <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-zinc-200">
                <div className="skeleton-shimmer h-full w-full rounded-full" />
              </div>
            </>
          ) : (
            <>
              {exampleFan?.length ? (
                <ExampleFan images={exampleFan} />
              ) : (
                <motion.span
                  animate={{
                    scale: dragging ? 1.15 : 1,
                    color: dragging ? '#6366f1' : '#71717a',
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/30"
                >
                  <Upload className="h-6 w-6" />
                </motion.span>
              )}
              <span className="rounded-full border border-zinc-200/60 bg-white px-4 py-2 text-sm font-semibold text-zinc-900">
                {emptyTitle}
              </span>
              <span className="text-xs text-zinc-500">{emptyHint}</span>
              {emptySubhint ? (
                <span className="max-w-sm text-xs text-zinc-400">{emptySubhint}</span>
              ) : null}
            </>
          )}
        </button>
      )}

      {error ? (
        <p className="absolute bottom-3 left-3 right-3 z-10 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 backdrop-blur-md">
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
}: {
  images: readonly string[];
  onPick?: (url: string) => void;
  disabled?: boolean;
}) {
  const rotations = [-14, 0, 14];
  const offsets = [-42, 0, 42];

  return (
    <div className="relative mb-1 flex h-36 w-full max-w-[220px] items-center justify-center sm:h-40">
      {images.slice(0, 3).map((src, index) => {
        const interactive = Boolean(onPick);
        const className =
          'absolute h-32 w-[4.6rem] overflow-hidden rounded-xl border border-white bg-zinc-100 shadow-lg shadow-zinc-300/50 sm:h-36 sm:w-20';
        const style = {
          transform: `translateX(${offsets[index] ?? 0}px) rotate(${rotations[index] ?? 0}deg)`,
          zIndex: index === 1 ? 3 : 1,
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
  garmentPreviewUrl,
  modelPreviewUrl,
  showModelThumb = true,
  running,
  disabled,
  resultImageUrl,
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
  garmentPreviewUrl: string | null;
  modelPreviewUrl: string | null;
  showModelThumb?: boolean;
  running: boolean;
  disabled: boolean;
  resultImageUrl: string | null;
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

  return (
    <div
      className={`flex min-w-0 flex-col gap-3 md:grid md:min-h-[460px] ${
        historyOpen
          ? 'md:grid-cols-[88px_minmax(0,1fr)_120px]'
          : 'md:grid-cols-[88px_minmax(0,1fr)_48px]'
      }`}
    >
      <div className="flex flex-row gap-2 overflow-x-auto scrollbar-none md:flex-col md:gap-3 md:overflow-visible">
        {onBackToSetup ? (
          <button
            type="button"
            disabled={locked}
            onClick={onBackToSetup}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2 py-1.5 text-xs font-semibold text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 md:w-full"
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

      <div className="glass-panel relative flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl border border-zinc-200/60 bg-white shadow-xl shadow-zinc-200/50 sm:rounded-3xl md:min-h-[460px]">
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
          </>
        ) : null}
      </div>

      <div className="glass-panel flex flex-col rounded-2xl border border-zinc-200/60 bg-white/70 p-2 shadow-sm">
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
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-1 items-center justify-center gap-1 bg-gradient-to-t from-white/95 to-transparent p-1.5 opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                        <HistoryAction
                          label={t('preview.download')}
                          onClick={() => onDownload(item.imageUrl)}
                        >
                          <Download className="h-3 w-3" />
                        </HistoryAction>
                        {thumb ? (
                          <HistoryAction
                            label={t('studio.openLightbox')}
                            onClick={() => onOpenLightbox(thumb)}
                          >
                            <Maximize2 className="h-3 w-3" />
                          </HistoryAction>
                        ) : null}
                        <HistoryAction
                          label={t('studio.reusePrompt')}
                          onClick={() => onReusePrompt(item.hashtags)}
                        >
                          <RefreshCw className="h-3 w-3" />
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

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-3 px-6 pb-7 pt-16 text-center">
        <div className="flex items-center gap-2.5 rounded-full border border-white/25 bg-white/15 px-3.5 py-1.5 backdrop-blur-md">
          <span className="meditative-spinner !h-4 !w-4 !border-2 !border-white/30 !border-t-white" />
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/90">
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
            className="max-w-sm text-sm font-medium text-white/90"
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
      className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-900"
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
}: {
  label: string;
  src: string | null;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex w-20 flex-col gap-1 disabled:opacity-50 md:w-full"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </span>
      <span className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-zinc-200/60 bg-zinc-50 shadow-sm transition group-hover:border-zinc-300 group-hover:shadow-md group-hover:shadow-zinc-200/50">
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
    <div className="group relative min-w-[7.5rem] shrink-0 snap-start flex-1 sm:min-w-0">
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
        className={`relative z-10 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
          active ? 'text-zinc-900' : 'text-zinc-500 hover:text-zinc-900'
        }`}
      >
        {active ? (
          <motion.span
            layoutId="studio-mode-pill"
            className="absolute inset-0 rounded-xl border border-zinc-200/50 bg-white shadow-sm"
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          />
        ) : null}
        <span className="relative z-10 flex items-center gap-2">
          {icon}
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
}: {
  children: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
        active
          ? 'border-zinc-900 bg-zinc-900 text-white'
          : 'border-zinc-200/60 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900'
      }`}
    >
      {children}
    </button>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200/60 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500">
      <span className="text-zinc-400">{label}</span>
      <span className="font-semibold text-zinc-900">{value}</span>
    </div>
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white/90 text-zinc-700 shadow-sm backdrop-blur-md transition hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
