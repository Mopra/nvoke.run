import type { DesktopSettings } from '../contract';

/**
 * `window.nvoke.desktop`: the settings for how the app lives on the computer,
 * and commands from main. Each feature adds its own fields to DesktopSettings
 * and its own setters to DesktopApi; `contract.ts` merges them.
 */
export const DesktopChannel = {
  desktopGetSettings: 'desktop:get-settings',
  /** Main to renderer push, payload DesktopCommand. */
  desktopCommand: 'desktop:command',
} as const;

/**
 * Something the main process asks the renderer to do, for example from the
 * tray menu: open a new search, the searches list or one search.
 */
export type DesktopCommand =
  | { name: 'new-search' }
  | { name: 'searches' }
  | { name: 'search'; id: string }
  /** Any screen, as a route hash such as `#/drops`. Sent by the quick window. */
  | { name: 'route'; hash: string };

export interface DesktopCoreApi {
  getSettings(): Promise<DesktopSettings>;
  /** Subscribes to commands from the tray. Returns an unsubscribe function. */
  onCommand(listener: (command: DesktopCommand) => void): () => void;
}
