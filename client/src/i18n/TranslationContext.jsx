import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'atzva_language';
const LANGUAGE_META = {
  he: { locale: 'he-IL', dir: 'rtl' },
  en: { locale: 'en-US', dir: 'ltr' },
  ar: { locale: 'ar', dir: 'rtl' }
};

const TranslationContext = createContext(null);

function normalizeLanguage(lang) {
  return ['he', 'en', 'ar'].includes(lang) ? lang : 'he';
}

// תומך גם בטוקן מגדר: {g:צורת-זכר|צורת-נקבה}
function interpolate(template, vars, gender) {
  const s = String(template || '').replace(/\{g:([^|}]*)\|([^}]*)\}/g, (_, m, f) => (gender === 'female' ? f : m));
  return s.replace(/\{(\w+)\}/g, (_, key) => vars?.[key] ?? '');
}

export function TranslationProvider({ children }) {
  const { user, updateProfile } = useAuth();
  const [language, setLanguage] = useState(() => normalizeLanguage(localStorage.getItem(STORAGE_KEY) || 'he'));
  const [items, setItems] = useState({});
  // 'אקראי': נקבע פעם אחת לכל טעינה (לא משתנה בכל רינדור)
  const [randomGender] = useState(() => (Math.random() < 0.5 ? 'female' : 'male'));
  const effectiveGender = (() => {
    const g = user?.gender;
    if (g === 'female') return 'female';
    if (g === 'male' || g === 'irrelevant') return 'male';
    return randomGender; // random / undefined
  })();

  useEffect(() => {
    const preferred = normalizeLanguage(user?.preferred_language || localStorage.getItem(STORAGE_KEY) || 'he');
    setLanguage((current) => current === preferred ? current : preferred);
  }, [user?.preferred_language]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
    api.get(`/site/translations?lang=${language}`)
      .then((r) => setItems(r.data?.items || {}))
      .catch(() => setItems({}));
  }, [language]);

  useEffect(() => {
    const meta = LANGUAGE_META[language] || LANGUAGE_META.he;
    document.documentElement.lang = language;
    document.documentElement.dir = meta.dir;
    document.body.dir = meta.dir;
  }, [language]);

  const changeLanguage = async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage);
    setLanguage(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
    if (user && user.preferred_language !== normalized) {
      await updateProfile({
        phone_number: user.phone_number || '',
        preferred_language: normalized
      });
    }
  };

  const value = useMemo(() => {
    const meta = LANGUAGE_META[language] || LANGUAGE_META.he;
    return {
      language,
      locale: meta.locale,
      dir: meta.dir,
      isRtl: meta.dir === 'rtl',
      setLanguage: changeLanguage,
      gender: effectiveGender,
      t: (key, vars) => interpolate(items[key] || key, vars, effectiveGender),
      pickText: (he, en, ar) => {
        if (language === 'he') return he || en || ar || '';
        if (language === 'ar') return ar || en || he || '';
        return en || he || ar || '';
      }
    };
  }, [items, language, effectiveGender]);

  return <TranslationContext.Provider value={value}>{children}</TranslationContext.Provider>;
}

export function useTranslation() {
  return useContext(TranslationContext);
}
