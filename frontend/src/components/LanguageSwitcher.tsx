import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n';

const LANG_CODES: Record<(typeof SUPPORTED_LANGS)[number], string> = {
  en: 'EN',
  ru: 'RU',
  uz: 'UZ',
  tg: 'TG',
};

function ChevronDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [isLangOpen, setIsLangOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentLang = (i18n.language || 'en').split('-')[0] as (typeof SUPPORTED_LANGS)[number];
  const currentCode = LANG_CODES[currentLang] ?? currentLang.toUpperCase();

  useEffect(() => {
    if (!isLangOpen) {
      return undefined;
    }

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsLangOpen((prev) => !prev)}
        aria-label={t('language.label')}
        aria-haspopup="listbox"
        aria-expanded={isLangOpen}
        className="flex h-9 cursor-pointer items-center gap-1 rounded-lg border border-slate-200/40 bg-slate-50 px-2.5 text-xs font-medium uppercase text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        <span aria-hidden="true">🌐</span>
        <span>{currentCode}</span>
        <ChevronDownIcon open={isLangOpen} />
      </button>

      {isLangOpen && (
        <div
          role="listbox"
          aria-label={t('language.label')}
          className="absolute right-0 z-50 mt-2 flex w-32 origin-top-right flex-col gap-0.5 rounded-xl border border-slate-200/80 bg-white p-1 shadow-[0_8px_30px_rgb(0,0,0,0.06)]"
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
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
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
