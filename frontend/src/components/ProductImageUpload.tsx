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
  base64Image: string | null;
  previewUrl: string | null;
  error: string | null;
  onImageLoaded: (base64: string, previewUrl: string) => void;
  onClear: () => void;
  onValidationError: (message: string) => void;
  variant?: 'default' | 'compact';
  labels?: ProductImageUploadLabels;
  overridePreviewUrl?: string | null;
}

export default function ProductImageUpload({
  disabled = false,
  base64Image,
  previewUrl,
  error,
  onImageLoaded,
  onClear,
  onValidationError,
  variant = 'default',
  labels,
  overridePreviewUrl = null,
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

      if (file.size > MAX_FILE_SIZE_BYTES) {
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
    [onImageLoaded, onValidationError, t],
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

  return (
    <div className={`contain-width min-w-0 space-y-3 ${isCompact ? 'flex h-full flex-col' : ''}`}>
      <input
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
          aria-describedby={error ? 'product-upload-error' : undefined}
          className={`group flex w-full min-w-0 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${
            isCompact ? 'min-h-[180px] flex-1 px-3 py-10 sm:px-4 sm:py-12' : 'min-h-[260px] px-4 py-16 sm:px-8 sm:py-20'
          } ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-white opacity-50'
              : error
                ? 'border-red-300 bg-red-50'
                : isDragging
                  ? 'border-indigo-400/80 bg-slate-100/50 shadow-sm'
                  : 'border-slate-300/80 bg-slate-50/60 hover:border-indigo-400/80 hover:bg-slate-100/50'
          }`}
        >
          <UploadIcon
            className={`transition-colors duration-300 ${
              isCompact ? 'h-9 w-9' : 'h-12 w-12'
            } ${error ? 'text-red-400' : 'text-slate-400 group-hover:text-indigo-500'} ${isDragging && !error ? 'text-indigo-500' : ''}`}
          />
          <p className={`break-words font-medium text-slate-700 ${isCompact ? 'mt-3 text-sm' : 'mt-4 text-base'}`}>
            {uploadTitle}
          </p>
          <p className="mt-1 break-words text-xs text-slate-400">{uploadHint}</p>
        </div>
      ) : (
        <div
          className={`rounded-xl border border-slate-200/80 bg-white shadow-sm ${
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
                className={`flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50 ${
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
              <p className="text-sm font-medium text-emerald-600">{uploadedLabel}</p>
              <p className={`mt-1 text-sm font-normal text-slate-500 ${isCompact ? 'min-h-[2.5rem]' : ''}`}>
                {uploadedHint}
              </p>
              <div className={`flex flex-wrap gap-2 ${isCompact ? 'mt-3 justify-center' : 'mt-4'}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleZoneClick}
                  className="rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all duration-300 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
                >
                  {t('ecommerce.replace')}
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onClear}
                  className="rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-500 transition-all duration-300 hover:border-red-200 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:opacity-50"
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
          id="product-upload-error"
          role="alert"
          className="text-sm text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}
