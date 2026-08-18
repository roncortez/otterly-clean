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

/**
 * Conmutador de idioma en píldora, con las dos versiones del mismo control:
 * `default` sobre superficie clara y `inverse` sobre el verde profundo de la
 * portada. Los colores salen de los tokens de la marca, no de la paleta por
 * defecto de Tailwind.
 */
const SELECTOR_TONES = {
  default: {
    track: 'border-border bg-surface-sunken',
    active: 'bg-surface-raised text-forest-800 shadow-sm',
    idle: 'text-text-muted hover:text-text',
  },
  inverse: {
    track: 'border-white/15 bg-white/10',
    active: 'bg-white text-forest-900 shadow-sm',
    idle: 'text-forest-100 hover:text-white',
  },
};

export function LanguageSelector({ className = '', tone = 'default' }) {
  const { lang, setLanguage } = useTranslation();
  const styles = SELECTOR_TONES[tone] ?? SELECTOR_TONES.default;

  /* `transition-all` incluía la fuente en negrita del estado activo, y animar el
     grosor de la letra es lo que hacía que ES/EN temblaran al cambiar de idioma.
     Se nombran el fondo, el color y la sombra, que es lo que de verdad cambia. */
  const optionClass = (code) =>
    `press rounded-full px-2.5 py-1 transition-[background-color,color,box-shadow] ${
      lang === code ? `font-bold ${styles.active}` : styles.idle
    }`;

  return (
    <div
      className={`inline-flex items-center rounded-full border p-0.5 text-xs font-semibold ${styles.track} ${className}`}
    >
      <button type="button" onClick={() => setLanguage('es')} className={optionClass('es')}>
        ES
      </button>
      <button type="button" onClick={() => setLanguage('en')} className={optionClass('en')}>
        EN
      </button>
    </div>
  );
}
