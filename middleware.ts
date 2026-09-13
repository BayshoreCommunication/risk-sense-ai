import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_ROLE, COOKIE_SESSION, ROLE_HOME, ROLE_PREFIXES, isRole } from './lib/session';

const PUBLIC_PATHS = ['/login', '/mfa'];

/**
 * Role-based route guard (DecisionLog 2026-09-13-04): one app, route groups per role.
 * This is a UX guard only; the backend enforces RBAC on every request (SEC-01).
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = req.cookies.get(COOKIE_ROLE)?.value;
  const hasSession = Boolean(req.cookies.get(COOKIE_SESSION)?.value);

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    if (hasSession && isRole(role)) return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));
    return NextResponse.next();
  }

  if (!hasSession || !isRole(role)) {
    const login = new URL('/login', req.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }

  if (pathname === '/') return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));

  const allowed = ROLE_PREFIXES[role].some((p) => pathname.startsWith(p));
  if (!allowed) return NextResponse.redirect(new URL(ROLE_HOME[role], req.url));

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)'],
};
