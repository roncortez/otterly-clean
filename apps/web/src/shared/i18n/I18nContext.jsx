import React, { createContext, useContext, useState, useMemo } from 'react';
import es from './locales/es';
import en from './locales/en';

const dictionaries = { es, en };
const STORAGE_KEY = 'otterly.lang';

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (saved === 'es' || saved === 'en')) return saved;
    const browserLang = navigator.language?.slice(0, 2);
    return browserLang === 'en' ? 'en' : 'es';
  });

  const setLanguage = (newLang) => {
    if (newLang === 'es' || newLang === 'en') {
      setLangState(newLang);
      localStorage.setItem(STORAGE_KEY, newLang);
    }
  };

  const t = useMemo(() => {
    const currentDict = dictionaries[lang] || es;

    return (path, fallback = '') => {
      const keys = path.split('.');
      let result = currentDict;
      for (const k of keys) {
        result = result?.[k];
        if (result === undefined) break;
      }

      if (result !== undefined) return result;

      // Fallback a español si no se encuentra en inglés
      let fallbackResult = es;
      for (const k of keys) {
        fallbackResult = fallbackResult?.[k];
        if (fallbackResult === undefined) break;
      }

      return fallbackResult !== undefined ? fallbackResult : fallback || path;
    };
  }, [lang]);

  const value = useMemo(
    () => ({
      lang,
      setLanguage,
      t,
    }),
    [lang, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation debe usarse dentro de I18nProvider');
  }
  return context;
}

export function LanguageSelector({ className = '' }) {
  const { lang, setLanguage } = useTranslation();

  return (
    <div className={`inline-flex items-center rounded-full bg-white/10 p-0.5 border border-white/15 text-xs font-semibold ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage('es')}
        className={`px-2.5 py-1 rounded-full transition-all ${
          lang === 'es'
            ? 'bg-white text-neutral-900 shadow-sm font-bold'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        ES
      </button>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={`px-2.5 py-1 rounded-full transition-all ${
          lang === 'en'
            ? 'bg-white text-neutral-900 shadow-sm font-bold'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        EN
      </button>
    </div>
  );
}
