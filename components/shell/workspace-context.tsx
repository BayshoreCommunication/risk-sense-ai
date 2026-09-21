'use client';

import { createContext, useContext } from 'react';
import type { components } from '@/lib/api/types';
import type { Role } from '@/lib/session';

export type TenantFeatures = components['schemas']['AuthTenant']['features'];

/**
 * The backend-verified identity the shell resolved from GET /me, for chrome that pages render themselves.
 * `features` is carried here so a page can gate on the tenant's feature map without repeating the shell's
 * `/me` call: the shell withholds `children` until that call succeeds, so this is the same verified answer
 * one request earlier, and a page-level refetch only spends the caller's SEC-04 budget (DecisionLog 44).
 */
export type Workspace = {
  role: Role;
  plan: string;
  features: TenantFeatures;
  sectors: string[];
  accessMode: components['schemas']['AccessMode'];
};

const WorkspaceContext = createContext<Workspace | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

/** Null until the shell has verified the session, and on pages rendered outside a role shell. */
export function useWorkspace(): Workspace | null {
  return useContext(WorkspaceContext);
}
