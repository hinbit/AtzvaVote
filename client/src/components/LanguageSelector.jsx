import { useTranslation } from '../i18n/TranslationContext';

export default function LanguageSelector({ compact = false }) {
  const { language, setLanguage, t } = useTranslation();

  return (
    <div className={`language-selector ${compact ? 'compact' : ''}`}>
      <div className="language-selector-besd">בס"ד</div>
      <label className="language-selector-label" htmlFor={compact ? 'site-language-compact' : 'site-language'}>
        {t('common.language')}
      </label>
      <select
        id={compact ? 'site-language-compact' : 'site-language'}
        value={language}
        onChange={(e) => setLanguage(e.target.value).catch(() => null)}
      >
        <option value="he">{t('common.language_he')}</option>
        <option value="ar">{t('common.language_ar')}</option>
        <option value="en">{t('common.language_en')}</option>
      </select>
    </div>
  );
}
