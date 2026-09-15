import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './types';
import { DEV_AUTH_ENABLED } from '../environment';
import { clearSession, COOKIE_DEV_USER, COOKIE_SESSION, readCookie } from '../session';
import { applyAuthHeaders, authBridgeState, type IdTokenProvider } from './auth-state';

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

let sessionRedirectStarted = false;

/** Update the token immediately without claiming Firebase's persisted state has finished loading. */
export function setIdTokenProvider(provider: IdTokenProvider | null): void {
  authBridgeState.setIdTokenProvider(provider);
}

/** Settle persisted-auth restoration from Firebase's initial auth-state observer result. */
export function completeInitialAuthState(provider: IdTokenProvider | null): void {
  authBridgeState.completeInitialState(provider);
}

/** Settle the bridge without a user when Firebase is not available for this deployment. */
export function markAuthBridgeUnavailable(): void {
  authBridgeState.markUnavailable();
}

/** Apply the same session-expiry behavior to typed API calls and the few required raw fetches. */
export async function handleSessionResponse(response: Response): Promise<Response> {
  if (response.status !== 401 || typeof window === 'undefined' || sessionRedirectStarted) return response;

  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: string } } | null;
  const code = payload?.error?.code;
  const hasSessionHint = Boolean(readCookie(COOKIE_SESSION));
  if (code !== 'SESSION_EXPIRED' && code !== 'SESSION_INVALID' && !(code === 'UNAUTHENTICATED' && hasSessionHint)) return response;

  sessionRedirectStarted = true;
  authBridgeState.setIdTokenProvider(null);
  clearSession();

  const login = new URL('/login', window.location.origin);
  login.searchParams.set('reason', code === 'SESSION_EXPIRED' ? 'session_expired' : 'session_invalid');
  if (window.location.pathname !== '/login') {
    login.searchParams.set('next', `${window.location.pathname}${window.location.search}`);
  }
  window.location.replace(login.toString());
  return response;
}

const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const sessionId = readCookie(COOKIE_SESSION);
    return applyAuthHeaders(request, {
      sessionId,
      devUser: DEV_AUTH_ENABLED ? readCookie(COOKIE_DEV_USER) : undefined,
      devAuthEnabled: DEV_AUTH_ENABLED,
    });
  },
  async onResponse({ response }) {
    return handleSessionResponse(response);
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
