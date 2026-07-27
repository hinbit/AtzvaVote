const fs = require('fs');
const path = require('path');

const themesDir = path.join(__dirname, '..', '..', 'resources', 'themes');
const requiredLoginFields = ['variant', 'icon', 'seal', 'kicker', 'headline', 'tagline', 'cta'];
const localizedFields = ['seal', 'kicker', 'headline', 'tagline', 'cta'];
const supportedLanguages = ['he', 'en', 'ar'];
const { DEFAULT_THEME, getActiveTheme, listThemes } = require('../lib/themes');

const failures = [];
const variants = new Map();
let checked = 0;

for (const directory of fs.readdirSync(themesDir).sort()) {
  const file = path.join(themesDir, directory, 'theme.json');
  if (!fs.existsSync(file)) continue;

  let theme;
  try {
    theme = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failures.push(`${directory}: invalid JSON (${error.message})`);
    continue;
  }

  checked += 1;
  const login = theme.login || {};
  for (const field of requiredLoginFields) {
    if (!login[field]) failures.push(`${directory}: missing login.${field}`);
  }
  for (const field of localizedFields) {
    for (const language of supportedLanguages) {
      if (!login[field]?.[language]) failures.push(`${directory}: missing login.${field}.${language}`);
    }
  }

  if (login.variant) {
    if (variants.has(login.variant)) {
      failures.push(`${directory}: login.variant duplicates ${variants.get(login.variant)} (${login.variant})`);
    } else {
      variants.set(login.variant, directory);
    }
  }

  const assets = theme.assets || {};
  for (const field of ['logo', 'bg1', 'bg2', 'favicon']) {
    if (!assets[field]) {
      failures.push(`${directory}: missing assets.${field}`);
      continue;
    }
    if (!fs.existsSync(path.join(themesDir, directory, assets[field]))) {
      failures.push(`${directory}: asset does not exist (${assets[field]})`);
    }
  }
}

const listedThemes = listThemes();
if (listedThemes.length !== checked) {
  failures.push(`listThemes returned ${listedThemes.length} themes, expected ${checked}`);
}
for (const listed of listedThemes) {
  const resolved = getActiveTheme(listed.name);
  if (resolved.name !== listed.name) failures.push(`${listed.name}: cannot be selected dynamically`);
  for (const field of ['logo', 'bg1', 'bg2', 'favicon']) {
    const expectedPrefix = `/theme-assets/${encodeURIComponent(listed.name)}/`;
    if (!resolved.assets[field]?.startsWith(expectedPrefix)) {
      failures.push(`${listed.name}: assets.${field} is not theme-scoped`);
    }
  }
}
if (getActiveTheme('__theme_does_not_exist__').name !== DEFAULT_THEME) {
  failures.push('unknown theme does not fall back to the default theme');
}

if (failures.length) {
  console.error(`Theme validation failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Theme validation passed: ${checked} themes, ${variants.size} unique login variants.`);
