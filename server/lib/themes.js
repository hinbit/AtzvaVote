// טעינת ערכות נושא. הערכה הפעילה יכולה להגיע מהגדרת מסד הנתונים,
// ובנפילה לאחור דרך משתנה הסביבה THEME (ברירת מחדל: atzvavote).
// כל הערכות נמצאות ב-resources/themes/{name}/ ומכילות theme.json + נכסים (logo/bg/favicon).
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', '..', 'resources', 'themes');
const DEFAULT_THEME = 'atzvavote';

// THEME מוגדר ב-.env שבשורש הפרויקט (ולא ב-server/.env). השרת רץ עם cwd=server,
// לכן טוענים במפורש את ה-.env השורשי כדי לאכלס את process.env.THEME (ללא דריסת קיימים).
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function themeDir(name) {
  return path.join(THEMES_DIR, name);
}

function loadThemeJson(name) {
  try {
    const raw = fs.readFileSync(path.join(themeDir(name), 'theme.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// שם הערכה הפעילה (נבדק שקיים, אחרת ברירת מחדל)
function activeThemeName(override) {
  const requested = String(override || process.env.THEME || '').trim() || DEFAULT_THEME;
  if (loadThemeJson(requested)) return requested;
  return DEFAULT_THEME;
}

function listThemes() {
  let names = [];
  try {
    names = fs.readdirSync(THEMES_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    names = [];
  }

  const preferredOrder = [DEFAULT_THEME, 'seach', 'hinbit', '4pharma', 'friends'];
  return names
    .filter((name) => loadThemeJson(name))
    .sort((a, b) => {
      const ai = preferredOrder.indexOf(a);
      const bi = preferredOrder.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map((name) => {
      const theme = loadThemeJson(name) || {};
      return {
        name,
        display_name: theme.display_name || { he: name, en: name, ar: name },
        variant: theme.login?.variant || ''
      };
    });
}

// מיזוג הגדרות התגים: ערכת הנושא הפעילה גוברת, עם נפילה לערכת ברירת המחדל.
function resolveBadgeImages(activeName, active, fallback) {
  const out = {};
  const merge = (theme, themeName) => {
    const badges = (theme && theme.badges) || {};
    for (const [id, def] of Object.entries(badges)) {
      if (def && def.image) {
        out[id] = `/theme-assets/${encodeURIComponent(themeName)}/${encodeURIComponent(def.image)}`;
      }
    }
  };
  // קודם fallback, אחר כך הפעילה — כך שהפעילה דורסת
  if (fallback) merge(fallback, DEFAULT_THEME);
  if (active && activeName !== DEFAULT_THEME) merge(active, activeName);
  return out;
}

// מחזיר את הקונפיגורציה של הערכה הפעילה עבור הלקוח
function getActiveTheme(override) {
  const name = activeThemeName(override);
  const active = loadThemeJson(name) || {};
  const fallback = loadThemeJson(DEFAULT_THEME) || {};
  const assets = active.assets || fallback.assets || {};
  const assetUrl = (file, assetTheme = name) => (
    file ? `/theme-assets/${encodeURIComponent(assetTheme)}/${encodeURIComponent(file)}` : null
  );

  return {
    name,
    display_name: active.display_name || { he: name, en: name, ar: name },
    meta: active.meta || {},
    login: active.login || fallback.login || {},
    colors: active.colors || {},
    assets: {
      logo: assetUrl(assets.logo),
      bg1: assetUrl(assets.bg1),
      bg2: assetUrl(assets.bg2),
      favicon: assetUrl(assets.favicon)
    },
    badge_images: resolveBadgeImages(name, active, fallback)
  };
}

// דריסות שמות (תפריט / שם אפליקציה) של הערכה הפעילה — להזרקה לתוך התרגומים
function getThemeNameOverrides(override) {
  const active = loadThemeJson(activeThemeName(override));
  return (active && active.names) || {};
}

// תיקיית הנכסים של הערכה הפעילה (להגשה סטטית)
function activeThemeAssetsDir() {
  return themeDir(activeThemeName());
}

module.exports = {
  getActiveTheme,
  getThemeNameOverrides,
  listThemes,
  loadThemeJson,
  activeThemeName,
  activeThemeAssetsDir,
  themeDir,
  DEFAULT_THEME,
  THEMES_DIR
};
