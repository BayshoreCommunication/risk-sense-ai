import type { Role } from './session';

export type PublicDemoAccount = {
  email: string;
  role: Role;
};

export type PublicDemoAccessMode = 'public_demo_read_only' | 'public_demo_sandbox';

/** The legacy value remains accepted only while the production aliases complete their cutover. */
export function isPublicDemoAccessMode(accessMode: unknown): accessMode is PublicDemoAccessMode {
  return accessMode === 'public_demo_sandbox' || accessMode === 'public_demo_read_only';
}

/** Sandbox-created identities are deliberately unroutable and cannot become real login principals. */
export function isReservedPublicDemoEmail(email: string) {
  return /^[^@\s]+@demo\.invalid$/i.test(email.trim());
}

/** RFC 2606's `.invalid` namespace keeps demo SSO configuration inert outside the sandbox. */
export function isReservedPublicDemoSsoDomain(domain: string) {
  return /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+invalid$/i.test(domain.trim());
}

/**
 * Fixed, non-customer identities provisioned by the deployment operator for the public interactive
 * sandbox. The backend issues a scoped session directly and remains authoritative for the returned
 * identity, tenant, role, and sandbox access mode; no shared browser credential exists.
 */
export const PUBLIC_DEMO_ACCOUNTS = [
  { email: 'requestor@tac.local', role: 'requestor' },
  { email: 'admin@dev.local', role: 'administrator' },
  { email: 'sysadmin@dev.local', role: 'system_administrator' },
  { email: 'audit@dev.local', role: 'audit' },
] as const satisfies readonly PublicDemoAccount[];

/** Public demo access is an explicit deployment choice and otherwise stays absent. */
export function isPublicDemoAccessAvailable(enabled: string | undefined) {
  return enabled === 'true';
}

export const PUBLIC_DEMO_ACCESS_AVAILABLE = isPublicDemoAccessAvailable(process.env.NEXT_PUBLIC_DEMO_ACCESS_ENABLED);
