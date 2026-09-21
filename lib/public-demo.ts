import type { Role } from './session';

export type PublicDemoAccount = {
  email: string;
  role: Role;
};

/**
 * Fixed, non-customer identities provisioned by the deployment operator for the public read-only
 * showcase. The backend issues a scoped session directly and remains authoritative for the
 * returned identity, tenant, role, and read-only access mode; no shared browser credential exists.
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
