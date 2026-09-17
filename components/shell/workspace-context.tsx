'use client';

import { createContext, useContext } from 'react';
import type { Role } from '@/lib/session';

/** The backend-verified identity the shell resolved from GET /me, for chrome that pages render themselves. */
export type Workspace = { role: Role; plan: string };

const WorkspaceContext = createContext<Workspace | null>(null);

export const WorkspaceProvider = WorkspaceContext.Provider;

/** Null until the shell has verified the session, and on pages rendered outside a role shell. */
export function useWorkspace(): Workspace | null {
  return useContext(WorkspaceContext);
}
