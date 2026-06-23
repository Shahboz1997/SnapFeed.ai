import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { generatePrompt } from '../api/generatePrompt';
import { ApiError } from '../api/generateImage';

interface ChatAssistantProps {
  disabled?: boolean;
  onPromptGenerated: (prompt: string) => void;
  onError: (message: string) => void;
}

export default function ChatAssistant({
  disabled = false,
  onPromptGenerated,
  onError,
}: ChatAssistantProps) {
  const { t, i18n } = useTranslation();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    if (!input.trim() || loading || disabled) return;

    setLoading(true);
    try {
      const currentLanguage = (i18n.language || 'ru').split('-')[0];
      const { prompt } = await generatePrompt({ message: input, lang: currentLanguage });
      onPromptGenerated(prompt);
      setInput('');
    } catch (err) {
      if (err instanceof ApiError && err.message) {
        onError(err.messageKey ? t(err.messageKey) : err.message);
      } else {
        onError(t('chat.error'));
      }
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSend();
    }
  }

  const canSend = !loading && !disabled && input.trim().length > 0;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 overflow-hidden rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <p className="text-sm font-semibold text-slate-900">{t('chat.title')}</p>
      <p className="text-xs font-normal text-slate-500">{t('chat.hybridHint')}</p>

      <div className="flex w-full flex-col gap-2.5 sm:flex-row sm:gap-3">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('chat.placeholder')}
          disabled={loading || disabled}
          aria-label={t('chat.inputAria')}
          className="min-w-0 flex-1 rounded-lg border border-slate-200/80 bg-white px-4 py-3 text-base text-slate-900 placeholder:font-light placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-slate-400 focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          aria-busy={loading}
          className="touch-target shrink-0 rounded-lg bg-slate-900 px-5 py-3 text-sm font-medium text-white shadow-md transition-all duration-300 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:opacity-80"
        >
          {loading ? t('chat.loading') : t('chat.button')}
        </button>
      </div>
    </div>
  );
}
