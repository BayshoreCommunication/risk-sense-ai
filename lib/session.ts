/**
 * Client-side session helpers. The app session (SEC-02) is issued by the backend; the frontend only
 * carries `sessionId` + identity and routes by role. Cookies are readable by `middleware.ts` for the
 * role guard; the backend re-checks everything on every request (frontend guards are UX, not security).
 */
export const ROLES = ['requestor', 'administrator', 'system_administrator', 'audit'] as const;
export type Role = (typeof ROLES)[number];

export const COOKIE_SESSION = 'rs_session';
export const COOKIE_ROLE = 'rs_role';
export const COOKIE_DEV_USER = 'rs_dev_user'; // dev bypass identity (X-Dev-User)

export const ROLE_HOME: Record<Role, string> = {
  requestor: '/chat',
  administrator: '/admin',
  system_administrator: '/system',
  audit: '/audit',
};

/** Which URL prefixes each role may open (mirrors backend RBAC, DASH-04). */
export const ROLE_PREFIXES: Record<Role, string[]> = {
  requestor: ['/chat', '/review'],
  administrator: ['/admin'],
  system_administrator: ['/system'],
  audit: ['/audit'],
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

function setCookie(name: string, value: string, maxAgeSec = 60 * 60 * 12) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}
export function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function storeSession(input: { sessionId: string; role: Role; devUser?: string }) {
  setCookie(COOKIE_SESSION, input.sessionId);
  setCookie(COOKIE_ROLE, input.role);
  if (input.devUser) setCookie(COOKIE_DEV_USER, input.devUser);
}

export function clearSession() {
  clearCookie(COOKIE_SESSION);
  clearCookie(COOKIE_ROLE);
  clearCookie(COOKIE_DEV_USER);
}
