import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { downloadImageBlob, triggerBlobDownload } from '../api/downloadImage';
import type { AspectRatio } from '../api/generateImage';
import type { AlertType } from './AlertBanner';
import Lightbox from './Lightbox';
import ImageCompareSlider from './ImageCompareSlider';
import Spinner from './Spinner';
import { getFormatFrame } from '../utils/formatFrame';

type Format = AspectRatio;

function FormatBadge({ ratio, label }: { ratio: string; label: string }) {
  return (
    <span className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600 shadow-sm">
      {ratio} · {label}
    </span>
  );
}

function PreviewSkeleton({ format }: { format: Format }) {
  const { t } = useTranslation();
  const frame = getFormatFrame(format);

  return (
    <div className={`flex w-full flex-col items-center gap-3 ${frame.frameClass}`}>
      <FormatBadge ratio={frame.ratio} label={t(`format.${format}`)} />
      <div
        aria-hidden="true"
        className={`skeleton-shimmer relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white ${frame.aspectClass}`}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/60" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/40 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/20 [animation-delay:300ms]" />
          </div>
          <span className="text-sm font-normal text-slate-500">{t('loading.composing')}</span>
          <span className="text-sm font-normal text-slate-400">{t('loading.layoutAdapts', { ratio: frame.ratio })}</span>
        </div>
      </div>
    </div>
  );
}

function TextExtractionSkeleton() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <div
        aria-hidden="true"
        className="skeleton-shimmer relative w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white px-6 py-12"
      >
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/60" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/40 [animation-delay:150ms]" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400/20 [animation-delay:300ms]" />
          </div>
          <span className="text-sm font-normal text-slate-600">{t('loading.extractingText')}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center sm:px-6 sm:py-12">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 sm:mb-5 sm:h-14 sm:w-14 lg:h-16 lg:w-16">
        <svg
          className="h-7 w-7 text-slate-400 sm:h-8 sm:w-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
          />
        </svg>
      </div>
      <p className="text-sm font-medium text-slate-700">{t('preview.emptyTitle')}</p>
      <p className="mt-2 max-w-xs text-sm font-normal text-slate-500">{t('preview.emptyDescription')}</p>
    </div>
  );
}

function ExtractedTextCard({
  extractedText,
  onNotify,
}: {
  extractedText: string;
  onNotify?: (message: string, type: AlertType) => void;
}) {
  const { t } = useTranslation();
  const [extractedCopied, setExtractedCopied] = useState(false);

  async function copyExtractedText() {
    await navigator.clipboard.writeText(extractedText);
    setExtractedCopied(true);
    onNotify?.(t('preview.extractedTextCopied'), 'success');
    setTimeout(() => setExtractedCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-700">
          {t('preview.extractedText')}
        </p>
        <button
          type="button"
          onClick={() => void copyExtractedText()}
          aria-label={t('preview.copyExtractedTextAria')}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
            extractedCopied
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-slate-200/80 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
          }`}
        >
          {extractedCopied ? t('preview.extractedTextCopied') : t('preview.copyExtractedText')}
        </button>
      </div>
      <p className="whitespace-pre-wrap text-sm font-normal leading-relaxed text-slate-700">
        {extractedText}
      </p>
    </div>
  );
}

interface GeneratedImagePreviewProps {
  loading: boolean;
  format: Format;
  imageUrl: string | null;
  originalImageUrl?: string | null;
  hashtags: string[];
  extractedText?: string | null;
  ocrOnly?: boolean;
  onNotify?: (message: string, type: AlertType) => void;
}

export default function GeneratedImagePreview({
  loading,
  format,
  imageUrl,
  originalImageUrl = null,
  hashtags,
  extractedText = null,
  ocrOnly = false,
  onNotify,
}: GeneratedImagePreviewProps) {
  const { t } = useTranslation();
  const [copiedTag, setCopiedTag] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadSaved, setDownloadSaved] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const frame = getFormatFrame(format);
  const formatLabel = t(`format.${format}`);
  const hasImage = Boolean(imageUrl);
  const hasCompare = hasImage && Boolean(originalImageUrl);
  const hasExtractedText = Boolean(extractedText?.trim());
  const textOnlyResult = hasExtractedText && !hasImage;
  const hasResult = hasImage || textOnlyResult;

  async function copyHashtag(tag: string) {
    await navigator.clipboard.writeText(tag);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 2000);
  }

  async function handleDownload() {
    if (!imageUrl || downloading) return;

    setDownloading(true);
    setDownloadSaved(false);

    try {
      const blob = await downloadImageBlob(imageUrl);
      triggerBlobDownload(blob, `snapfeed-${frame.filenameSuffix}-${Date.now()}.png`);
      setDownloadSaved(true);
      onNotify?.(t('alerts.downloadSuccess'), 'success');
      setTimeout(() => setDownloadSaved(false), 3000);
    } catch {
      onNotify?.(t('alerts.downloadWarning'), 'warning');
    } finally {
      setDownloading(false);
    }
  }

  function renderSubtitle() {
    if (loading) {
      return ocrOnly ? t('preview.extractingText') : t('preview.generatingLayout', { ratio: frame.ratio });
    }
    if (textOnlyResult) {
      return t('preview.textExtractedReady');
    }
    if (hasImage) {
      return t('preview.readyToPost');
    }
    return t('preview.waiting');
  }

  const hashtagButtonClass = (isCopied: boolean) =>
    isCopied
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-slate-200/80 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50';

  return (
    <>
      <section
        aria-labelledby="preview-heading"
        className="relative z-10 flex w-full min-h-[360px] flex-col rounded-2xl border border-white/70 bg-slate-50/75 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md sm:min-h-[480px] sm:p-8 lg:w-[420px] lg:shrink-0 lg:p-10"
      >
        <div className="mb-6 flex items-start justify-between gap-3 sm:mb-8 sm:items-center sm:gap-4">
          <div className="min-w-0">
            <h2 id="preview-heading" className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {t('preview.title')}
            </h2>
            <p className="mt-1 text-sm font-normal text-slate-500">{renderSubtitle()}</p>
          </div>
          {hasResult && !loading && (
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
              {textOnlyResult ? t('preview.textComplete') : t('preview.complete')}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col">
          {loading && (
            <div className="flex flex-1 items-center justify-center py-4">
              {ocrOnly ? <TextExtractionSkeleton /> : <PreviewSkeleton format={format} />}
            </div>
          )}

          {!loading && textOnlyResult && (
            <div className="flex flex-1 flex-col gap-4 sm:gap-6">
              {hashtags.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {t('preview.hashtags')}
                  </p>
                  <div className="flex flex-wrap gap-2" role="list">
                    {hashtags.map((tag) => {
                      const isCopied = copiedTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          role="listitem"
                          onClick={() => copyHashtag(tag)}
                          aria-label={
                            isCopied
                              ? t('preview.hashtagCopiedAria', { tag })
                              : t('preview.copyHashtagAria', { tag })
                          }
                          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${hashtagButtonClass(isCopied)}`}
                        >
                          {tag}
                          {isCopied && (
                            <span className="ml-1.5 text-xs text-emerald-600" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <ExtractedTextCard extractedText={extractedText!} onNotify={onNotify} />
            </div>
          )}

          {!loading && hasImage && (
            <div className="flex flex-1 flex-col gap-4 sm:gap-6">
              <div className="flex w-full flex-1 flex-col items-center justify-center gap-3 sm:gap-4">
                <FormatBadge ratio={frame.ratio} label={formatLabel} />
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  aria-label={t('preview.openEnlargedAria')}
                  className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 ease-out hover:border-slate-300 hover:shadow-[0_12px_40px_rgb(0,0,0,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${frame.frameClass}`}
                >
                  {hasCompare ? (
                    <ImageCompareSlider
                      beforeSrc={originalImageUrl!}
                      afterSrc={imageUrl!}
                      beforeAlt={t('preview.beforeImageAlt')}
                      afterAlt={t('preview.imageAlt')}
                      aspectClass={frame.aspectClass}
                    />
                  ) : (
                    <div className={`${frame.aspectClass} w-full`}>
                      <img
                        src={imageUrl!}
                        alt={t('preview.imageAlt')}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                        draggable={false}
                      />
                      <div className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-slate-900/30 to-transparent pb-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                        <span className="rounded-full border border-white/20 bg-white/90 px-3 py-1 text-xs font-normal text-slate-700 shadow-sm backdrop-blur-sm">
                          {t('preview.clickToEnlarge')}
                        </span>
                      </div>
                    </div>
                  )}
                </button>
              </div>

              {hashtags.length > 0 && (
                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                    {t('preview.hashtags')}
                  </p>
                  <div className="flex flex-wrap gap-2" role="list">
                    {hashtags.map((tag) => {
                      const isCopied = copiedTag === tag;
                      return (
                        <button
                          key={tag}
                          type="button"
                          role="listitem"
                          onClick={() => copyHashtag(tag)}
                          aria-label={
                            isCopied
                              ? t('preview.hashtagCopiedAria', { tag })
                              : t('preview.copyHashtagAria', { tag })
                          }
                          className={`rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-sm transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${hashtagButtonClass(isCopied)}`}
                        >
                          {tag}
                          {isCopied && (
                            <span className="ml-1.5 text-xs text-emerald-600" aria-hidden="true">
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  aria-label={t('preview.downloadAria')}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-slate-900 px-6 py-4 text-base font-semibold text-white shadow-md transition-all duration-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {downloading ? (
                    <>
                      <Spinner className="h-5 w-5" />
                      {t('preview.downloading')}
                    </>
                  ) : (
                    <>
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                      {t('preview.download')}
                    </>
                  )}
                </button>

                {downloadSaved && (
                  <p
                    className="animate-in text-center text-sm font-medium text-emerald-600"
                    role="status"
                    aria-live="polite"
                  >
                    {t('preview.imageSaved')}
                  </p>
                )}
              </div>
            </div>
          )}

          {!loading && !hasResult && <EmptyState />}
        </div>
      </section>

      {lightboxOpen && imageUrl && (
        <Lightbox
          imageUrl={imageUrl}
          alt={t('preview.imageAltEnlarged')}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
