import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

/**
 * NFR-08 — locale resolution without URL prefixes. The in-app language control writes `rs_locale`;
 * English remains the safe default and every partial catalogue falls back to English by key.
 */
export const LOCALES = ['en', 'bn'] as const;
export type Locale = (typeof LOCALES)[number];
export const COOKIE_LOCALE = 'rs_locale';

type Messages = Record<string, unknown>;
/** Partial locale files override English key by key at any depth (a missing key never renders as `a.b.c`). */
function deepMerge(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' ? deepMerge(b as Messages, v as Messages) : v;
  }
  return out;
}

export default getRequestConfig(async () => {
  const jar = await cookies();
  const fromCookie = jar.get(COOKIE_LOCALE)?.value;
  const locale = (LOCALES as readonly string[]).includes(fromCookie ?? '') ? (fromCookie as string) : 'en';
  const en = (await import('../messages/en.json')).default as Messages;
  const messages = locale === 'en' ? en : deepMerge(en, (await import(`../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
