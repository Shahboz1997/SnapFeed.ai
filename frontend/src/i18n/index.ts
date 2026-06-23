import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uz from './locales/uz.json';
import tg from './locales/tg.json';

const STORAGE_KEY = 'snapfeed-lang';
const SUPPORTED_LANGS = ['en', 'ru', 'uz', 'tg'] as const;

function resolveInitialLanguage(): string {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && SUPPORTED_LANGS.includes(saved as (typeof SUPPORTED_LANGS)[number])) {
    return saved;
  }

  const browserLang = navigator.language.split('-')[0];
  if (SUPPORTED_LANGS.includes(browserLang as (typeof SUPPORTED_LANGS)[number])) {
    return browserLang;
  }

  return 'en';
}

const initialLang = resolveInitialLanguage();
document.documentElement.lang = initialLang;

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ru: { translation: ru },
    uz: { translation: uz },
    tg: { translation: tg },
  },
  lng: initialLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  localStorage.setItem(STORAGE_KEY, lng);
  document.documentElement.lang = lng;
});

export { SUPPORTED_LANGS };
export default i18n;
