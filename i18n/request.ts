import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

/**
 * NFR-08 — locale resolution without URL prefixes: `rs_locale` cookie (set by the switcher) → Accept-Language → en.
 * Messages live in `messages/<locale>.json`; a locale falls back to English for any missing key.
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
  const accept = (await headers()).get('accept-language') ?? '';
  const preferred = accept.split(',').map((s) => s.trim().slice(0, 2).toLowerCase());
  const locale = ((LOCALES as readonly string[]).includes(fromCookie ?? '') ? fromCookie : preferred.find((l) => (LOCALES as readonly string[]).includes(l))) ?? 'en';
  const en = (await import('../messages/en.json')).default as Messages;
  const messages = locale === 'en' ? en : deepMerge(en, (await import(`../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
