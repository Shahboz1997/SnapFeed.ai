import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProductFallbackReason } from '../api/generateProductImage';
import type { ProductGenerationMode } from '../constants/productGenerationPresets';
import type { TryOnCategory, TryOnGender } from '../constants/tryOnOptions';
import {
  TRYON_CATEGORY_OPTIONS,
  TRYON_GENDER_OPTIONS,
} from '../constants/tryOnOptions';
import { filterTryOnModels, resolveRequiredModelType } from '../constants/tryOnModels';
import ProductImageUpload from './ProductImageUpload';
import ProductPromptAssistant, { type ProductPromptAssistantResult } from './ProductPromptAssistant';

const MODE_TOGGLE_CLASS =
  'flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50';

const CHIP_ACTIVE_CLASS = 'border-blue-600 bg-blue-600 text-white';
const CHIP_INACTIVE_CLASS =
  'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';

type ProductGenerationPanelProps = {
  disabled?: boolean;
  generationMode: ProductGenerationMode;
  onGenerationModeChange: (mode: ProductGenerationMode) => void;
  tryOnGender: TryOnGender;
  onTryOnGenderChange: (gender: TryOnGender) => void;
  tryOnCategory: TryOnCategory;
  onTryOnCategoryChange: (category: TryOnCategory) => void;
  tryOnFallbackReason?: ProductFallbackReason | null;
  productImageBase64: string | null;
  productImagePreviewUrl: string | null;
  productImageFileError: string | null;
  garmentBase64: string | null;
  garmentPreviewUrl: string | null;
  garmentFileError: string | null;
  humanBase64: string | null;
  humanPreviewUrl: string | null;
  humanFileError: string | null;
  selectedModelUrl: string | null;
  userWish: string;
  userWishMaxLength: number;
  hashtags: string[];
  onProductImageLoaded: (base64: string, previewUrl: string) => void;
  onProductImageClear: () => void;
  onProductImageValidationError: (message: string) => void;
  onGarmentLoaded: (base64: string, previewUrl: string) => void;
  onGarmentClear: () => void;
  onGarmentValidationError: (message: string) => void;
  onHumanLoaded: (base64: string, previewUrl: string) => void;
  onHumanClear: () => void;
  onHumanValidationError: (message: string) => void;
  onModelSelect: (url: string) => void;
  onModelClear: () => void;
  onUserWishChange: (value: string) => void;
  onAssistantResult: (result: ProductPromptAssistantResult) => void;
  onAssistantError: (message: string) => void;
};

function ChipButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? CHIP_ACTIVE_CLASS : CHIP_INACTIVE_CLASS
      }`}
    >
      {children}
    </button>
  );
}

export default function ProductGenerationPanel({
  disabled = false,
  generationMode,
  onGenerationModeChange,
  tryOnGender,
  onTryOnGenderChange,
  tryOnCategory,
  onTryOnCategoryChange,
  tryOnFallbackReason = null,
  productImageBase64,
  productImagePreviewUrl,
  productImageFileError,
  garmentBase64,
  garmentPreviewUrl,
  garmentFileError,
  humanBase64,
  humanPreviewUrl,
  humanFileError,
  selectedModelUrl,
  userWish,
  userWishMaxLength,
  hashtags,
  onProductImageLoaded,
  onProductImageClear,
  onProductImageValidationError,
  onGarmentLoaded,
  onGarmentClear,
  onGarmentValidationError,
  onHumanLoaded,
  onHumanClear,
  onHumanValidationError,
  onModelSelect,
  onModelClear,
  onUserWishChange,
  onAssistantResult,
  onAssistantError,
}: ProductGenerationPanelProps) {
  const { t } = useTranslation();
  const [modelGalleryOpen, setModelGalleryOpen] = useState(false);

  const genderLabelKey: Record<TryOnGender, string> = {
    male: 'ecommerce.tryOnSelectors.genderMale',
    female: 'ecommerce.tryOnSelectors.genderFemale',
  };

  const categoryLabelKey: Record<TryOnCategory, string> = {
    top: 'ecommerce.tryOnSelectors.categoryTop',
    bottom: 'ecommerce.tryOnSelectors.categoryBottom',
    dress: 'ecommerce.tryOnSelectors.categoryDress',
  };

  const availableModels = useMemo(
    () => filterTryOnModels(tryOnGender, resolveRequiredModelType(tryOnCategory)),
    [tryOnGender, tryOnCategory],
  );

  function handleHumanClear() {
    onHumanClear();
    onModelClear();
  }

  function handleModelPick(url: string) {
    onModelSelect(url);
    setModelGalleryOpen(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-medium text-slate-700">
          {t('ecommerce.generationMode.label')}
        </p>
        <div
          role="tablist"
          aria-label={t('ecommerce.generationMode.label')}
          className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-200/50 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={generationMode === 'product'}
            disabled={disabled}
            onClick={() => onGenerationModeChange('product')}
            className={`${MODE_TOGGLE_CLASS} ${
              generationMode === 'product'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('ecommerce.generationMode.product')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={generationMode === 'tryon'}
            disabled={disabled}
            onClick={() => onGenerationModeChange('tryon')}
            className={`${MODE_TOGGLE_CLASS} ${
              generationMode === 'tryon'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('ecommerce.generationMode.tryon')}
          </button>
        </div>

        {generationMode === 'tryon' && (
          <div className="animate-in fade-in slide-in-from-top-2 duration-300 mt-3 space-y-3">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                {t('ecommerce.tryOnSelectors.genderLabel')}
              </p>
              <div className="flex flex-wrap gap-2">
                {TRYON_GENDER_OPTIONS.map((option) => (
                  <ChipButton
                    key={option}
                    active={tryOnGender === option}
                    disabled={disabled}
                    onClick={() => onTryOnGenderChange(option)}
                  >
                    {t(genderLabelKey[option])}
                  </ChipButton>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-600">
                {t('ecommerce.tryOnSelectors.categoryLabel')}
              </p>
              <div className="flex flex-wrap gap-2">
                {TRYON_CATEGORY_OPTIONS.map((option) => (
                  <ChipButton
                    key={option}
                    active={tryOnCategory === option}
                    disabled={disabled}
                    onClick={() => onTryOnCategoryChange(option)}
                  >
                    {t(categoryLabelKey[option])}
                  </ChipButton>
                ))}
              </div>
            </div>
          </div>
        )}

        {generationMode === 'tryon' && tryOnFallbackReason && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {tryOnFallbackReason === 'verification_failed'
              ? t('ecommerce.tryOnFallbackVerificationBanner')
              : t('ecommerce.tryOnFallbackBanner')}
          </div>
        )}
      </div>

      {generationMode === 'product' ? (
        <ProductImageUpload
          inputId="product-photo-upload"
          disabled={disabled}
          base64Image={productImageBase64}
          previewUrl={productImagePreviewUrl}
          error={productImageFileError}
          onImageLoaded={onProductImageLoaded}
          onClear={onProductImageClear}
          onValidationError={onProductImageValidationError}
        />
      ) : (
        <div className="animate-in fade-in duration-300 space-y-3">
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            <ProductImageUpload
              inputId="tryon-garment-upload"
              disabled={disabled}
              variant="compact"
              base64Image={garmentBase64}
              previewUrl={garmentPreviewUrl}
              error={garmentFileError}
              onImageLoaded={onGarmentLoaded}
              onClear={onGarmentClear}
              onValidationError={onGarmentValidationError}
              labels={{
                uploadTitle: t('ecommerce.tryOnUpload.garmentTitle'),
                uploadHint: t('ecommerce.uploadHint'),
                uploadAria: t('ecommerce.tryOnUpload.garmentAria'),
                previewAlt: t('ecommerce.tryOnUpload.garmentPreviewAlt'),
                uploaded: t('ecommerce.tryOnUpload.garmentUploaded'),
                uploadedHint: t('ecommerce.tryOnUpload.garmentUploadedHint'),
              }}
            />

            <ProductImageUpload
              inputId="tryon-human-upload"
              disabled={disabled}
              variant="compact"
              base64Image={humanBase64}
              previewUrl={humanPreviewUrl}
              overridePreviewUrl={humanBase64 ? null : selectedModelUrl}
              error={humanFileError}
              onImageLoaded={onHumanLoaded}
              onClear={handleHumanClear}
              onValidationError={onHumanValidationError}
              labels={{
                uploadTitle: t('ecommerce.tryOnUpload.humanTitle'),
                uploadHint: t('ecommerce.uploadHint'),
                uploadAria: t('ecommerce.tryOnUpload.humanAria'),
                previewAlt: t('ecommerce.tryOnUpload.humanPreviewAlt'),
                uploaded: humanBase64
                  ? t('ecommerce.tryOnUpload.humanUploaded')
                  : t('ecommerce.tryOnUpload.modelSelected'),
                uploadedHint: humanBase64
                  ? t('ecommerce.tryOnUpload.humanUploadedHint')
                  : t('ecommerce.tryOnUpload.modelSelectedHint'),
              }}
            />
          </div>

          <div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setModelGalleryOpen((open) => !open)}
              className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {modelGalleryOpen
                ? t('ecommerce.tryOnUpload.hideModelGallery')
                : t('ecommerce.tryOnUpload.showModelGallery')}
            </button>

            {modelGalleryOpen && (
              <div
                role="listbox"
                aria-label={t('ecommerce.tryOnUpload.modelGalleryAria')}
                className="animate-in fade-in slide-in-from-top-1 duration-200 mt-2 max-h-36 overflow-x-auto overflow-y-hidden"
              >
                <div className="flex gap-2 pb-1">
                  {availableModels.map((model) => {
                    const isSelected = selectedModelUrl === model.url && !humanBase64;

                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        disabled={disabled}
                        onClick={() => handleModelPick(model.url)}
                        className={`relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                          isSelected
                            ? 'border-blue-600 ring-2 ring-blue-200'
                            : 'border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        <img
                          src={model.url}
                          alt=""
                          className="h-full w-full object-cover object-top"
                          loading="lazy"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {generationMode === 'product' ? (
        <ProductPromptAssistant
          disabled={disabled}
          userText={userWish}
          userTextMaxLength={userWishMaxLength}
          onUserTextChange={onUserWishChange}
          onResult={onAssistantResult}
          onError={onAssistantError}
          hashtags={hashtags}
        />
      ) : (
        <div>
          <label htmlFor="user-wish" className="mb-3 block text-sm font-medium text-slate-700">
            {t('ecommerce.wishLabel')}
          </label>
          <input
            id="user-wish"
            type="text"
            value={userWish}
            onChange={(event) => onUserWishChange(event.target.value)}
            disabled={disabled}
            maxLength={userWishMaxLength}
            placeholder={t('ecommerce.wishPlaceholder')}
            className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-900 placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 lg:py-4 lg:text-sm"
          />
        </div>
      )}
    </div>
  );
}
