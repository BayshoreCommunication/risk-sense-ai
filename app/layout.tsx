import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages, getTranslations } from 'next-intl/server';
import { cookies } from 'next/headers';
import { AuthBridge } from '@/components/auth/AuthBridge';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { normalizeTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('metadata');
  return { title: t('title'), description: t('description') };
}

/** NFR-08: locale from the `rs_locale` cookie (or Accept-Language); every client component may call `useTranslations`. */
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [locale, messages, cookieStore] = await Promise.all([getLocale(), getMessages(), cookies()]);
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);
  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable}${theme === 'dark' ? ' dark' : ''}`}
      data-theme={theme}
      style={{ colorScheme: theme }}
    >
      <body className="font-sans antialiased">
        <ThemeProvider initialTheme={theme}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <AuthBridge />
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
