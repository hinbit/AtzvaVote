import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api/client';

const ThemeContext = createContext(null);

// מחיל את ערכת הנושא הפעילה (נבחרת בשרת דרך THEME ב-.env):
// צבעים → משתני CSS, רקעים, לוגו, favicon וכותרת.
export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    api.get('/site/theme').then(r => setTheme(r.data)).catch(() => setTheme(null));
  }, []);

  useEffect(() => {
    if (!theme) return;
    const root = document.documentElement;

    // צבעים → משתני CSS (--ink, --gold, ...)
    for (const [key, value] of Object.entries(theme.colors || {})) {
      root.style.setProperty(`--${key}`, value);
    }

    // רקעים → משתני CSS שבהם משתמש theme.css
    if (theme.assets?.bg1) root.style.setProperty('--bg-image-1', `url("${theme.assets.bg1}")`);
    if (theme.assets?.bg2) root.style.setProperty('--bg-image-2', `url("${theme.assets.bg2}")`);

    // favicon
    if (theme.assets?.favicon) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
      link.href = theme.assets.favicon;
    }

    // צבע נושא + כותרת
    if (theme.meta?.theme_color) {
      let meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', theme.meta.theme_color);
    }
    const lang = document.documentElement.lang || 'he';
    const title = theme.meta?.title;
    if (title) document.title = title[lang] || title.he || title.en || document.title;
  }, [theme]);

  return (
    <ThemeContext.Provider value={{
      theme,
      assets: theme?.assets || {},
      badgeImages: theme?.badge_images || {}
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext) || { theme: null, assets: {}, badgeImages: {} };
}
