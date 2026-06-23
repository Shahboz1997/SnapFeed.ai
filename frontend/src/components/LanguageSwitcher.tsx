import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '../i18n';

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">{t('language.label')}</span>
      <select
        value={i18n.language.split('-')[0]}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        aria-label={t('language.label')}
        className="cursor-pointer rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm transition-all duration-300 hover:border-slate-300 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
      >
        {SUPPORTED_LANGS.map((code) => (
          <option key={code} value={code}>
            {t(`language.${code}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
