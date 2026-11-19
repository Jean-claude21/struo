import { createContext, useContext, type ReactNode } from 'react';
import { en } from './en.ts';
import { fr, type Catalog } from './fr.ts';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const CATALOGS: Record<Locale, Catalog> = { fr, en };
export const LOCALE_COOKIE = 'struo_lang';

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every key of the catalogs, checked by the compiler. */
export type MessageKey = Leaves<Catalog>;
export type Params = Record<string, string | number | null | undefined>;

export const isLocale = (value: unknown): value is Locale => value === 'fr' || value === 'en';

/** Looks a key up (also dynamic keys such as `errors.${code}`) and fills its placeholders. */
export function translate(locale: Locale, key: MessageKey | string, params: Params = {}): string {
  let node: unknown = CATALOGS[locale];
  for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node !== 'string') return key;
  return node.replace(/\{(\w+)\}/gu, (match, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}

/** The locale an HTTP request asks for: cookie, then Accept-Language, then French. */
export function localeFromHeaders(cookie: string | null, acceptLanguage: string | null): Locale {
  const chosen = cookie?.match(new RegExp(`${LOCALE_COOKIE}=(fr|en)`, 'u'))?.[1];
  if (isLocale(chosen)) return chosen;
  const first = acceptLanguage?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return first === 'en' ? 'en' : 'fr';
}

const I18nContext = createContext<Locale>('fr');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const locale = useContext(I18nContext);
  const t = (key: MessageKey, params?: Params) => translate(locale, key, params);
  /** A refusal from the server (its message is an error code) in the person's language. */
  const errorText = (error: unknown) => {
    const code = error instanceof Error ? error.message : String(error);
    const [name, raw] = code.split('|');
    const text = translate(locale, `errors.${name}`, raw ? (JSON.parse(raw) as Params) : {});
    return text.startsWith('errors.') ? translate(locale, 'errors.generic') : text;
  };
  return { locale, t, errorText };
}
