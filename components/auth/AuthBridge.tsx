'use client';

import { useEffect } from 'react';
import { initAuthBridge } from '@/lib/firebase/client';

/** Mounted once in the root layout: wires Firebase's current user → API client Authorization header. */
export function AuthBridge() {
  useEffect(() => initAuthBridge(), []);
  return null;
}
