import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { generateProductPrompt } from '../api/generateProductPrompt';
import { ApiError } from '../api/generateImage';
import Spinner from './Spinner';

export interface ProductPromptAssistantResult {
  optimizedPrompt: string;
  overlayText: string;
  hashtags: string[];
}

interface ProductPromptAssistantProps {
  disabled?: boolean;
  userText: string;
  userTextMaxLength: number;
  onUserTextChange: (value: string) => void;
  onResult: (result: ProductPromptAssistantResult) => void;
  onError: (message: string) => void;
  hashtags: string[];
}

export default function ProductPromptAssistant({
  disabled = false,
  userText,
  userTextMaxLength,
  onUserTextChange,
  onResult,
  onError,
  hashtags,
}: ProductPromptAssistantProps) {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);

  async function handleGeneratePrompt() {
    const trimmed = userText.trim();
    if (!trimmed || loading || disabled) return;

    setLoading(true);
    setSuccessVisible(false);

    try {
      const currentLanguage = (i18n.language || 'ru').split('-')[0];
      const result = await generateProductPrompt({
        userText: trimmed,
        lang: currentLanguage,
      });

      onResult(result);
      setSuccessVisible(true);
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        onError(err.messageKey ? t(err.messageKey) : err.message);
      } else {
        onError(t('ecommerce.assistant.error'));
      }
    } finally {
      setLoading(false);
    }
  }

  const canGenerate = !loading && !disabled && userText.trim().length > 0;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="user-wish" className="mb-3 block text-sm font-medium text-slate-700">
          {t('ecommerce.wishLabel')}
        </label>
        <input
          id="user-wish"
          type="text"
          value={userText}
          onChange={(event) => {
            onUserTextChange(event.target.value);
            setSuccessVisible(false);
          }}
          disabled={disabled || loading}
          maxLength={userTextMaxLength}
          placeholder={t('ecommerce.assistant.placeholder')}
          className="w-full rounded-xl border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-900 placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 lg:py-4 lg:text-sm"
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={() => void handleGeneratePrompt()}
          disabled={!canGenerate}
          aria-busy={loading}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-md transition-all duration-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500"
        >
          {loading ? (
            <>
              <Spinner className="h-4 w-4" />
              {t('ecommerce.assistant.loading')}
            </>
          ) : (
            t('ecommerce.assistant.button')
          )}
        </button>
        <p className="text-xs font-normal text-slate-500">{t('ecommerce.assistant.hint')}</p>
      </div>

      {successVisible && (
        <p
          role="status"
          className="animate-in fade-in slide-in-from-top-1 duration-300 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm font-medium text-emerald-800"
        >
          {t('ecommerce.assistant.success')}
        </p>
      )}

      {hashtags.length > 0 && (
        <div className="animate-in fade-in duration-300 space-y-2">
          <p className="text-xs font-medium text-slate-600">{t('preview.hashtags')}</p>
          <div className="flex flex-wrap gap-2">
            {hashtags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm"
              >
                {tag.startsWith('#') ? tag : `#${tag}`}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
