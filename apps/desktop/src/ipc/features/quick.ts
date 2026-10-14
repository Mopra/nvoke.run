import type { DesktopSettings } from '../contract';

/** The quick window: the command bar over any app, opened by a global shortcut. */
export const QuickChannel = {
  desktopSetHotkey: 'desktop:set-hotkey',
  /** Quick window to main, fire and forget. */
  quickHide: 'quick:hide',
  /** Quick window to main, fire and forget, payload a route hash. */
  quickOpenInMain: 'quick:open-in-main',
  /** Quick window to main, fire and forget, payload a height in px. */
  quickSetHeight: 'quick:set-height',
  /** Main to quick window push, every time the window is shown. */
  quickShown: 'quick:shown',
  /** Main to quick window push after each show, payload FrontTab or null. */
  quickFrontTab: 'quick:front-tab',
  /** Quick window to main, no payload: reads the front tab after asking macOS for permission. */
  quickReadFrontTab: 'quick:read-front-tab',
} as const;

export interface QuickSettings {
  /** The global shortcut that opens the quick window, in Electron's accelerator format. */
  hotkey: string;
  /** Why the shortcut is not active, for example another app holds it. Null when it works. */
  hotkeyError: string | null;
}

export interface QuickDesktopApi {
  /**
   * Registers a new global shortcut for the quick window. A clash with another
   * app does not throw: the old shortcut stays and `hotkeyError` says why.
   */
  setHotkey(accelerator: string): Promise<DesktopSettings>;
}

/** What the clipboard held when the quick window opened: one domain, URL or email address, else null. */
export type QuickClipboard = { domain: string; from: 'domain' | 'url' | 'email' } | null;

/**
 * The site in the browser tab that was in front when the shortcut was pressed.
 * - `read`: the address bar named `domain`.
 * - `ask`: macOS only. Reading needs the user's Automation permission, which
 *   has not been asked for this browser yet; `readFrontTab()` asks.
 * - `denied`: macOS only. The user refused that permission.
 */
export type FrontTab =
  | { status: 'read'; browser: string; domain: string }
  | { status: 'ask'; browser: string }
  | { status: 'denied'; browser: string };

/** The small command window that opens over any app from the global shortcut. */
export interface QuickApi {
  /** Hides the window and gives focus back to the app that was in front. */
  hide(): void;
  /** Hides the window and shows the main window on a screen, given as a route hash like `#/searches/ID`. */
  openInMain(hash: string): void;
  /** Fits the window to its content, in CSS px. */
  setHeight(height: number): void;
  /**
   * Fires each time the window is shown, so it can start fresh, with what the
   * clipboard named at that moment. The clipboard is read only then. Returns
   * an unsubscribe function.
   */
  onShown(listener: (clipboard: QuickClipboard) => void): () => void;
  /**
   * Fires shortly after each show with the site in the front browser tab, or
   * null (no browser in front, Linux, or nothing readable). The tab is read
   * only when the shortcut opens the window. Returns an unsubscribe function.
   */
  onFrontTab(listener: (tab: FrontTab | null) => void): () => void;
  /**
   * macOS, after an `ask` tab: asks for the Automation permission (macOS shows
   * its prompt the first time) and reads the tab. Null when nothing was read.
   */
  readFrontTab(): Promise<FrontTab | null>;
}

export interface QuickBridge {
  quick: QuickApi;
}
