import { getRequestConfig } from 'next-intl/server';

/**
 * NFR-08 — English-only launch mode. Bengali messages remain in the repository for a future,
 * explicitly approved re-enable, but stale locale cookies cannot change the rendered language.
 */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];

type Messages = Record<string, unknown>;

export default getRequestConfig(async () => {
  const messages = (await import('../messages/en.json')).default as Messages;
  return { locale: 'en', messages };
});
