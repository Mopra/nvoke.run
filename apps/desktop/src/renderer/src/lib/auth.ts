import { useEffect, useSyncExternalStore } from 'react';
import { api } from './api';
import type { AuthState } from './types';

/**
 * Auth state as a tiny external store. `undefined` until the first answer from
 * the transport. The bridge pushes changes (browser sign-in finished, session
 * expired) through `onAuthChange`.
 */
let current: AuthState | undefined;
const listeners = new Set<() => void>();

function set(next: AuthState): void {
  current = next;
  for (const l of listeners) l();
}

export function refreshAuth(): void {
  api
    .getAuthState()
    .then(set)
    .catch(() => set({ status: 'signed-out' }));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAuth(): AuthState | undefined {
  useEffect(() => {
    refreshAuth();
    return api.onAuthChange(set);
  }, []);
  return useSyncExternalStore(subscribe, () => current);
}
