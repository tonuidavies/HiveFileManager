import React, { createContext, useContext, useMemo } from 'react';
import { NativeModules, Platform } from 'react-native';
import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import pt from './locales/pt';
import de from './locales/de';
import ru from './locales/ru';
import hi from './locales/hi';
import id from './locales/id';
import sw from './locales/sw';

// To add a language: create ./locales/<code>.js (copy en.js), import it above and list it here.
const DICTS = { en, es, fr, pt, de, ru, hi, id, sw };

export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'ru', name: 'Русский' },
  { code: 'hi', name: 'हिन्दी' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'sw', name: 'Kiswahili' },
];

/** Device language code such as "en" or "sw" (Android reports e.g. "sw_KE"). */
export function deviceLanguage() {
  try {
    const raw =
      Platform.OS === 'android'
        ? NativeModules.I18nManager?.localeIdentifier
        : NativeModules.SettingsManager?.settings?.AppleLocale || NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
    const code = String(raw || 'en').replace('-', '_').split('_')[0].toLowerCase();
    // Old ISO codes some Android versions still report
    if (code === 'in') return 'id';
    return code;
  } catch {
    return 'en';
  }
}

export function resolveLanguage(pref) {
  const code = !pref || pref === 'system' ? deviceLanguage() : pref;
  return DICTS[code] ? code : 'en';
}

let current = resolveLanguage('system');

export const currentLanguage = () => current;
export const setLanguage = (pref) => {
  current = resolveLanguage(pref);
  return current;
};

function pluralCategory(lang, n) {
  try {
    return new Intl.PluralRules(lang).select(n);
  } catch {
    return n === 1 ? 'one' : 'other';
  }
}

function fill(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
}

export function translate(lang, key, vars) {
  const dict = DICTS[lang] || en;
  let str;
  if (vars && vars.count !== undefined) {
    const cat = pluralCategory(lang, Number(vars.count));
    str = dict[`${key}_${cat}`] ?? dict[`${key}_other`] ?? en[`${key}_${cat === 'one' ? 'one' : 'other'}`];
  }
  if (str === undefined) str = dict[key] ?? en[key] ?? key;
  return fill(str, vars);
}

/** Use outside React components (helpers, native callbacks). Inside components prefer useT(). */
export const tr = (key, vars) => translate(current, key, vars);

const I18nContext = createContext({ t: tr, lang: 'en' });

export function I18nProvider({ language, children }) {
  const lang = setLanguage(language); // keeps tr() in sync during render
  const value = useMemo(() => ({ lang, t: (key, vars) => translate(lang, key, vars) }), [lang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = () => useContext(I18nContext).t;
