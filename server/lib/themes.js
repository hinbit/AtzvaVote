// טעינת ערכת נושא (theme) פעילה. הערכה נבחרת דרך משתנה הסביבה THEME (ברירת מחדל: seach).
// כל הערכות נמצאות ב-resources/themes/{name}/ ומכילות theme.json + נכסים (logo/bg/favicon).
const fs = require('fs');
const path = require('path');

const THEMES_DIR = path.join(__dirname, '..', '..', 'resources', 'themes');
const DEFAULT_THEME = 'seach';

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
function activeThemeName() {
  const requested = (process.env.THEME || '').trim() || DEFAULT_THEME;
  if (loadThemeJson(requested)) return requested;
  return DEFAULT_THEME;
}

// מיזוג הגדרות התגים: ערכת הנושא הפעילה גוברת, עם נפילה לערכת ברירת המחדל (seach)
function resolveBadgeImages(activeName, active, fallback) {
  const out = {};
  const merge = (theme, themeName) => {
    const badges = (theme && theme.badges) || {};
    for (const [id, def] of Object.entries(badges)) {
      if (def && def.image) out[id] = `/theme-assets/${encodeURIComponent(def.image)}?theme=${themeName}`;
    }
  };
  // קודם fallback (seach), אחר כך הפעילה — כך שהפעילה דורסת
  if (fallback) merge(fallback, DEFAULT_THEME);
  if (active && activeName !== DEFAULT_THEME) merge(active, activeName);
  return out;
}

// מחזיר את הקונפיגורציה של הערכה הפעילה עבור הלקוח
function getActiveTheme() {
  const name = activeThemeName();
  const active = loadThemeJson(name) || {};
  const fallback = loadThemeJson(DEFAULT_THEME) || {};
  const assets = active.assets || fallback.assets || {};
  const assetUrl = (file) => (file ? `/theme-assets/${encodeURIComponent(file)}` : null);

  return {
    name,
    display_name: active.display_name || { he: name, en: name, ar: name },
    meta: active.meta || {},
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
function getThemeNameOverrides() {
  const active = loadThemeJson(activeThemeName());
  return (active && active.names) || {};
}

// תיקיית הנכסים של הערכה הפעילה (להגשה סטטית)
function activeThemeAssetsDir() {
  return themeDir(activeThemeName());
}

module.exports = {
  getActiveTheme,
  getThemeNameOverrides,
  activeThemeName,
  activeThemeAssetsDir,
  themeDir,
  DEFAULT_THEME,
  THEMES_DIR
};
