import { NextResponse } from 'next/server';

const LOCALES = ['en'] as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { locale?: unknown } | null;
  const locale = body?.locale;

  if (typeof locale !== 'string' || !(LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'Unsupported locale.' }, { status: 400 });
  }

  const response = NextResponse.json({ data: { locale } });
  response.cookies.set('rs_locale', locale, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
