import { useCallback, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadIcon } from './icons';

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

interface ProductImageUploadProps {
  disabled?: boolean;
  base64Image: string | null;
  previewUrl: string | null;
  error: string | null;
  onImageLoaded: (base64: string, previewUrl: string) => void;
  onClear: () => void;
  onValidationError: (message: string) => void;
}

export default function ProductImageUpload({
  disabled = false,
  base64Image,
  previewUrl,
  error,
  onImageLoaded,
  onClear,
  onValidationError,
}: ProductImageUploadProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

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

      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          onValidationError(t('ecommerce.readFailed'));
          return;
        }
        onImageLoaded(result, result);
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
    <div className="space-y-3">
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

      {!base64Image ? (
        <div
          role="button"
          tabIndex={disabled ? -1 : 0}
          onClick={handleZoneClick}
          onKeyDown={handleKeyDown}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          aria-label={t('ecommerce.uploadAria')}
          aria-disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'product-upload-error' : undefined}
          className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:px-8 sm:py-12 ${
            disabled
              ? 'cursor-not-allowed border-slate-200 bg-white opacity-50'
              : error
                ? 'border-red-300 bg-red-50'
                : isDragging
                  ? 'border-slate-400 bg-slate-50 shadow-sm'
                  : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50'
          }`}
        >
          <UploadIcon className={`mb-4 h-10 w-10 ${error ? 'text-red-400' : 'text-slate-400'}`} />
          <p className="text-sm font-medium text-slate-700">{t('ecommerce.uploadTitle')}</p>
          <p className="mt-2 text-sm font-normal text-slate-500">{t('ecommerce.uploadHint')}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-5">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={t('ecommerce.previewAlt')}
                className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-600">{t('ecommerce.uploaded')}</p>
              <p className="mt-1 text-sm font-normal text-slate-500">{t('ecommerce.uploadedHint')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
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
