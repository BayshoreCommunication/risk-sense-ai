import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './types';
import { COOKIE_DEV_USER, COOKIE_SESSION, readCookie } from '../session';

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * The only way the frontend talks to the backend (Patterns.md). Types come from the backend's
 * openapi.json via `npm run gen:api`; never hand-write request/response shapes.
 *
 * Auth headers:
 *  - `Authorization: Bearer <Firebase ID token>` once Firebase is wired (T-013);
 *  - until then `X-Dev-User` (backend AUTH_DEV_BYPASS) — never available in production builds.
 *  - `X-Session-Id` for the app session (SEC-02).
 */
export const api = createClient<paths>({ baseUrl, credentials: 'include' });

let idTokenProvider: (() => Promise<string | null>) | null = null;
/** Registered by the Firebase client once a user is signed in. */
export function setIdTokenProvider(fn: (() => Promise<string | null>) | null) {
  idTokenProvider = fn;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = idTokenProvider ? await idTokenProvider() : null;
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    else if (process.env.NEXT_PUBLIC_ENV !== 'production') {
      const devUser = readCookie(COOKIE_DEV_USER);
      if (devUser) request.headers.set('X-Dev-User', devUser);
    }
    const sessionId = readCookie(COOKIE_SESSION);
    if (sessionId) request.headers.set('X-Session-Id', sessionId);
    return request;
  },
};
api.use(authMiddleware);

export type ApiError = { code: string; message: string; details?: unknown };

/**
 * Narrow any thrown value to our error shape:
 *  - API envelope `{ error: { code, message } }`
 *  - Firebase Auth errors `{ code: 'auth/…', message }` (popup closed, provider disabled, unauthorized domain, …)
 *  - anything else → NETWORK
 */
export function toApiError(error: unknown): ApiError {
  const e = error as { error?: ApiError; code?: unknown; message?: unknown } | undefined;
  if (e?.error?.code) return e.error;
  if (typeof e?.code === 'string') {
    const friendly: Record<string, string> = {
      'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
      'auth/cancelled-popup-request': 'Another sign-in window is already open.',
      'auth/popup-blocked': 'The browser blocked the sign-in popup. Allow popups for this site.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase (Authentication → Sign-in method).',
      'auth/unauthorized-domain': 'This domain is not authorized in Firebase (Authentication → Settings → Authorized domains).',
      'auth/invalid-action-code': 'This sign-in link is invalid or has already been used.',
    };
    return { code: e.code, message: friendly[e.code] ?? `${e.code}: ${String(e.message ?? '')}` };
  }
  if (typeof e?.message === 'string' && e.message) return { code: 'NETWORK', message: e.message };
  return { code: 'NETWORK', message: 'Could not reach the API' };
}
