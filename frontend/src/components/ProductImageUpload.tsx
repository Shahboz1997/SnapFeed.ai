import { useCallback, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadIcon } from './icons';
import { compressImageForUpload } from '../utils/compressImageForUpload';

const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function isAcceptedImage(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.includes(file.type)) {
    return true;
  }

  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension ? ACCEPTED_EXTENSIONS.includes(extension) : false;
}

export interface ProductImageUploadLabels {
  uploadTitle?: string;
  uploadHint?: string;
  uploadAria?: string;
  previewAlt?: string;
  uploaded?: string;
  uploadedHint?: string;
}

interface ProductImageUploadProps {
  disabled?: boolean;
  inputId?: string;
  base64Image: string | null;
  previewUrl: string | null;
  error: string | null;
  onImageLoaded: (base64: string, previewUrl: string) => void;
  onClear: () => void;
  onValidationError: (message: string) => void;
  variant?: 'default' | 'compact';
  labels?: ProductImageUploadLabels;
  overridePreviewUrl?: string | null;
  /** Skip JPEG resize/compress — keep original pixels for try-on fidelity */
  preserveQuality?: boolean;
  maxFileSizeBytes?: number;
}

export default function ProductImageUpload({
  disabled = false,
  inputId = 'product-image-upload',
  base64Image,
  previewUrl,
  error,
  onImageLoaded,
  onClear,
  onValidationError,
  variant = 'default',
  labels,
  overridePreviewUrl = null,
  preserveQuality = false,
  maxFileSizeBytes = MAX_FILE_SIZE_BYTES,
}: ProductImageUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const uploadTitle = labels?.uploadTitle ?? t('ecommerce.uploadTitle');
  const uploadHint = labels?.uploadHint ?? t('ecommerce.uploadHint');
  const uploadAria = labels?.uploadAria ?? t('ecommerce.uploadAria');
  const previewAlt = labels?.previewAlt ?? t('ecommerce.previewAlt');
  const uploadedLabel = labels?.uploaded ?? t('ecommerce.uploaded');
  const uploadedHint = labels?.uploadedHint ?? t('ecommerce.uploadedHint');

  const hasImage = Boolean(base64Image) || Boolean(overridePreviewUrl);
  const displayPreviewUrl = previewUrl || overridePreviewUrl;
  const isCompact = variant === 'compact';

  const processFile = useCallback(
    (file: File) => {
      if (!isAcceptedImage(file)) {
        onValidationError(t('ecommerce.invalidType'));
        return;
      }

      if (file.size > maxFileSizeBytes) {
        onValidationError(t('ecommerce.fileTooLarge'));
        return;
      }

      const reader = new FileReader();

      reader.onload = async () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          onValidationError(t('ecommerce.readFailed'));
          return;
        }

        try {
          if (preserveQuality) {
            onImageLoaded(result, result);
            return;
          }
          const compressed = await compressImageForUpload(result);
          onImageLoaded(compressed, compressed);
        } catch {
          onValidationError(t('ecommerce.readFailed'));
        }
      };

      reader.onerror = () => {
        onValidationError(t('ecommerce.readFailed'));
      };

      reader.readAsDataURL(file);
    },
    [maxFileSizeBytes, onImageLoaded, onValidationError, preserveQuality, t],
  );

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
    event.target.value = '';
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  }

  function handleZoneClick() {
    if (!disabled) {
      inputRef.current?.click();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleZoneClick();
    }
  }

  const errorId = `${inputId}-error`;

  return (
    <div className={`contain-width min-w-0 space-y-3 ${isCompact ? 'flex h-full flex-col' : ''}`}>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES.join(',')}
        onChange={handleInputChange}
        disabled={disabled}
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
      />

      {!hasImage ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={handleZoneClick}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={uploadAria}
          aria-disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={`group flex w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed text-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 ${
            isCompact ? 'min-h-[140px] flex-1 px-3 py-8 sm:min-h-[180px] sm:px-4 sm:py-12' : 'min-h-[200px] px-4 py-10 sm:min-h-[260px] sm:px-8 sm:py-20'
          } ${
            disabled
              ? 'cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-50'
              : error
                ? 'border-rose-300 bg-rose-50'
                : isDragging
                  ? 'border-zinc-400 bg-zinc-50 scale-[1.01]'
                  : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50 active:bg-zinc-50'
          }`}
        >
          <UploadIcon
            className={`transition-colors duration-300 ${
              isCompact ? 'h-8 w-8 sm:h-9 sm:w-9' : 'h-10 w-10 sm:h-12 sm:w-12'
            } ${error ? 'text-rose-600' : 'text-zinc-400 group-hover:text-zinc-600'} ${isDragging && !error ? 'text-zinc-600 scale-110' : ''}`}
          />
          <p className={`break-words font-medium text-zinc-900 ${isCompact ? 'mt-2.5 text-sm' : 'mt-3 text-base'}`}>
            {uploadTitle}
          </p>
          <p className="mt-1 break-words text-xs text-zinc-500">{uploadHint}</p>
        </div>
      ) : (
        <div
          className={`rounded-2xl border border-zinc-200/60 bg-white shadow-sm ${
            isCompact ? 'flex h-full flex-col p-4' : 'p-4 sm:p-5'
          }`}
        >
          <div
            className={`flex flex-1 flex-col ${
              isCompact
                ? 'items-center gap-3 text-center'
                : 'items-center gap-4 sm:flex-row sm:items-start sm:gap-5 sm:text-left'
            }`}
          >
            {displayPreviewUrl && (
              <div
                className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-200/60 bg-zinc-50 ${
                  isCompact ? 'h-24 w-24' : 'h-24 w-24 sm:h-20 sm:w-20'
                }`}
              >
                <img
                  src={displayPreviewUrl}
                  alt={previewAlt}
                  className="h-full w-full object-cover object-center"
                />
              </div>
            )}
            <div className={`min-w-0 flex-1 ${isCompact ? 'w-full' : ''}`}>
              <p className="text-sm font-medium text-emerald-700">{uploadedLabel}</p>
              <p className={`mt-1 text-sm font-normal text-zinc-500 ${isCompact ? 'min-h-[2.5rem]' : ''}`}>
                {uploadedHint}
              </p>
              <div className={`flex flex-wrap gap-2 ${isCompact ? 'mt-3 justify-center' : 'mt-4'}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleZoneClick}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 disabled:opacity-50"
                >
                  {t('ecommerce.replace')}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onClear}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/40 disabled:opacity-50"
                >
                  {t('ecommerce.remove')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-sm text-rose-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
