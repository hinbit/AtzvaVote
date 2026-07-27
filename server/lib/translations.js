const { translations, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } = require('../data/translations');

function normalizeLanguage(lang) {
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
}

async function seedTranslations(t) {
  for (const [translationKey, values] of Object.entries(translations)) {
    for (const lang of SUPPORTED_LANGUAGES) {
      const value = values[lang] || values[DEFAULT_LANGUAGE] || '';
      await t.run(`
        INSERT INTO translations (translation_key, language_code, translation_value)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE translation_value = VALUES(translation_value)
      `, [translationKey, lang, value]);
    }
  }
}

module.exports = {
  seedTranslations,
  normalizeLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  translations
};
