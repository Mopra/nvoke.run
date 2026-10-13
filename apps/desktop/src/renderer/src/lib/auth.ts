import { useEffect, useState } from 'react';
import type { AuthState } from '../../../ipc/contract';

/** Current sign-in state from the main process, kept live through the bridge. */
export function useAuthState(): AuthState | null {
  const [state, setState] = useState<AuthState | null>(null);

  useEffect(() => {
    let active = true;
    const off = window.nvoke.auth.onChange((next) => setState(next));
    void window.nvoke.auth.getState().then((initial) => {
      if (active) setState((current) => current ?? initial);
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  return state;
}
