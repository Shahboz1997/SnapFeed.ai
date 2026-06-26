import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n';

const LANG_CODES: Record<(typeof SUPPORTED_LANGS)[number], string> = {
  en: 'EN',
  ru: 'RU',
  uz: 'UZ',
  tg: 'TG',
};

function GlobeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 shrink-0 text-slate-500"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912 2.706C6.176 11.398 6.061 12.218 6 13c0 .805.122 1.578.347 2.306.364-.133.695-.303 1.007-.512a6.012 6.012 0 012.188-2.12 6.012 6.012 0 01-2.706-1.912A6.012 6.012 0 018.027 4.332 6.012 6.012 0 0110 4c.782 0 1.602.115 2.267.332a6.012 6.012 0 01-2.12 2.188 6.012 6.012 0 01-2.706 1.912 6.012 6.012 0 01-1.912 2.706A6.012 6.012 0 014.332 8.027zM10 16c.805 0 1.578-.122 2.306-.347-.133-.364-.303-.695-.512-1.007a6.012 6.012 0 01-2.12-2.188 6.012 6.012 0 01-1.912-2.706A6.012 6.012 0 016 13c0-.782-.115-1.602-.332-2.267a6.012 6.012 0 012.188-2.12 6.012 6.012 0 012.706-1.912A6.012 6.012 0 0113.973 4.332 6.012 6.012 0 0116 6c0 .805-.122 1.578-.347 2.306-.364.133-.695.303-1.007.512a6.012 6.012 0 01-2.188 2.12 6.012 6.012 0 01-1.912 2.706A6.012 6.012 0 0115.668 11.973 6.012 6.012 0 0110 16z"
        clipRule="evenodd"
      />
    </svg>
  );
}

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
        className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200/80 bg-slate-50/50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-all hover:border-slate-300 hover:bg-white"
      >
        <GlobeIcon />
        <span>{currentCode}</span>
        <ChevronDownIcon open={isLangOpen} />
      </button>

      {isLangOpen && (
        <div
          role="listbox"
          aria-label={t('language.label')}
          className="absolute left-0 z-50 mt-2.5 flex w-32 origin-top-left flex-col gap-0.5 rounded-xl border border-slate-200/80 bg-white/95 p-1 shadow-[0_8px_30px_rgb(0,0,0,0.06)] backdrop-blur-md lg:left-auto lg:right-0 lg:origin-top-right"
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
