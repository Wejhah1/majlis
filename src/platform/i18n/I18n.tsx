import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Localized } from '../../games/types';
import { strings, type Dict, type Pair, type StringKey } from './strings';

export type Lang = 'ar' | 'en';
type Vars = Record<string, string | number>;

type I18n = {
  lang: Lang;
  dir: 'rtl' | 'ltr';
  setLang(lang: Lang): void;
  t(key: StringKey, vars?: Vars): string;
  /** Translate a raw [ar, en] pair (game dictionaries use these). */
  tr(pair: Pair, vars?: Vars): string;
  /** Picks the right side of a { ar, en } value coming from a game or the admin. */
  pick(value: Localized): string;
  /** Error code → readable sentence, checking a game's dictionary first. */
  errorText(code: string, gameErrors?: Dict): string;
  /** Locale-aware number formatting (Arabic-Indic digits in Arabic). */
  num(n: number): string;
};

const STORAGE_KEY = 'majlis-lang';
const Ctx = createContext<I18n | null>(null);

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch {
    // Private mode or blocked storage: fall through to the default.
  }
  return 'ar';
}

const fill = (text: string, vars?: Vars) => {
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
  return text;
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; still switches for this visit.
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const index = lang === 'ar' ? 0 : 1;
    const nf = new Intl.NumberFormat(lang === 'ar' ? 'ar-SA-u-nu-arab' : 'en');
    const tr = (pair: Pair, vars?: Vars) => fill(pair[index], vars);
    return {
      lang,
      dir,
      setLang,
      tr,
      t: (key, vars) => tr(strings[key], vars),
      pick: (v) => v[lang],
      errorText(code, gameErrors) {
        const pair = gameErrors?.[code] ?? (strings as Dict)[`err.${code}`];
        return pair ? tr(pair) : tr(strings['err.generic'], { code });
      },
      num: (n) => nf.format(n),
    };
  }, [lang, dir, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useI18n outside I18nProvider');
  return ctx;
}
