/**
 * App updates and the What's new card. Only in the desktop app: without the
 * bridge (VITE_MOCK in a plain browser) there is nothing to update and the UI
 * hides. docs/desktop/updates.md.
 */
import { useEffect, useState } from 'react';
import type { UpdatesApi, UpdateState } from '../../../ipc/contract';

export function updatesApi(): UpdatesApi | null {
  const api = (window as unknown as { nvoke?: { updates?: UpdatesApi } }).nvoke?.updates;
  return api && typeof api.getState === 'function' ? api : null;
}

/** The updater's state, live. Null outside the desktop app or until main answers. */
export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const api = updatesApi();
    if (!api) return;
    let live = true;
    api
      .getState()
      .then((s) => live && setState(s))
      .catch(() => undefined);
    const off = api.onChange(setState);
    return () => {
      live = false;
      off();
    };
  }, []);
  return state;
}

/** What the Account row says about updates. */
export function describeUpdate(state: UpdateState): string {
  const v = state.version;
  switch (state.status) {
    case 'unsupported':
      return `nvoke ${state.current}, a development build. Installed builds update themselves.`;
    case 'checking':
      return `nvoke ${state.current}. Checking for a newer version.`;
    case 'downloading':
      return `Downloading ${v ?? 'the update'}${state.percent ? `, ${state.percent}%` : ''}. It installs when nvoke restarts.`;
    case 'available':
      return `nvoke ${v} is out. Download it and drag it into Applications.`;
    case 'ready':
      return `nvoke ${v} is ready. It installs on restart, or by itself while nvoke sits in the tray.`;
    case 'error':
      return `nvoke ${state.current}. The last check failed: ${state.error ?? 'unknown error'}.`;
    case 'idle':
      return `nvoke ${state.current}, up to date.`;
  }
}
