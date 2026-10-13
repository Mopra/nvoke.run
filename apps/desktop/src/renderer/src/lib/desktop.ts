/**
 * How the app lives on the computer: start at login and the commands the
 * tray sends. Works without the bridge (VITE_MOCK in a plain browser), where
 * there is no tray and the setting is hidden.
 */
import { useEffect, useRef } from 'react';
import type { DesktopApi, DesktopCommand, FilesApi, QuickApi } from '../../../ipc/contract';

export function desktopApi(): DesktopApi | null {
  const api = (window as unknown as { nvoke?: { desktop?: DesktopApi } }).nvoke?.desktop;
  return api && typeof api.getSettings === 'function' ? api : null;
}

/** Where the icon lives, for copy: the menu bar on macOS, the tray elsewhere. */
export function trayPlace(): string {
  return document.documentElement.dataset['platform'] === 'darwin' ? 'menu bar' : 'tray';
}

/** Runs `handler` for every command the tray sends, for as long as the component is mounted. */
export function useDesktopCommands(handler: (command: DesktopCommand) => void): void {
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => desktopApi()?.onCommand((command) => ref.current(command)), []);
}

/** The quick window's side of the bridge. Null outside the desktop app. */
export function quickApi(): QuickApi | null {
  const api = (window as unknown as { nvoke?: { quick?: QuickApi } }).nvoke?.quick;
  return api && typeof api.hide === 'function' ? api : null;
}

/** True in the quick window, which loads the same renderer on `#/quick`. */
export function isQuickWindow(): boolean {
  return window.location.hash.startsWith('#/quick');
}

/** The file drop's half of the bridge. Missing in a plain browser, where the enriched copy downloads instead. */
export function filesApi(): FilesApi | null {
  const api = (window as unknown as { nvoke?: { files?: FilesApi } }).nvoke?.files;
  return api && typeof api.saveEnriched === 'function' ? api : null;
}
