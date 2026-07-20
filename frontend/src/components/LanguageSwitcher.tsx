import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Globe } from 'lucide-react';
import { SUPPORTED_LANGS } from '../i18n';

const LANG_CODES: Record<(typeof SUPPORTED_LANGS)[number], string> = {
  en: 'EN',
  ru: 'RU',
  uz: 'UZ',
  tg: 'TG',
};

type LanguageSwitcherProps = {
  variant?: 'light' | 'dark';
};

export default function LanguageSwitcher({ variant = 'light' }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = (i18n.language || 'en').split('-')[0] as (typeof SUPPORTED_LANGS)[number];
  const currentCode = LANG_CODES[currentLang] ?? currentLang.toUpperCase();

  useEffect(() => {
    if (!isLangOpen) return undefined;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsLangOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLangOpen]);

  function handleSelectLanguage(code: (typeof SUPPORTED_LANGS)[number]) {
    i18n.changeLanguage(code);
    setIsLangOpen(false);
  }

  void variant;

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsLangOpen((prev) => !prev)}
        aria-label={t('language.label')}
        aria-haspopup="listbox"
        aria-expanded={isLangOpen}
        className="flex h-9 cursor-pointer items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-2.5 text-xs font-medium uppercase text-zinc-600 shadow-sm shadow-zinc-200/40 transition hover:border-zinc-300 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/20"
      >
        <Globe className="h-3.5 w-3.5 text-zinc-400" />
        <span>{currentCode}</span>
        <ChevronDown
          className={`h-3 w-3 text-zinc-400 transition-transform duration-200 ${isLangOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isLangOpen && (
        <div
          role="listbox"
          aria-label={t('language.label')}
          className="absolute right-0 z-50 mt-2 flex w-40 origin-top-right flex-col gap-0.5 rounded-xl border border-zinc-200/70 bg-white/95 p-1 shadow-xl shadow-zinc-200/70 backdrop-blur-xl"
        >
          {SUPPORTED_LANGS.map((code) => {
            const isActive = code === currentLang;

            return (
              <button
                key={code}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => handleSelectLanguage(code)}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-zinc-900 text-white'
                    : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
                }`}
              >
                {t(`language.${code}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
