export const WindowChannel = {
  windowGetChrome: 'window:get-chrome',
  windowSetTheme: 'window:set-theme',
  windowClose: 'window:close',
  /** Main to renderer push, payload WindowState. */
  windowStateChanged: 'window:state-changed',
} as const;

/** The appearance the user picked. `system` follows the OS. */
export type ThemeSource = 'system' | 'light' | 'dark';

/**
 * How the frameless window is dressed on this platform. The window has no
 * native controls: the renderer's power nub closes it (to the tray), the
 * drag region's double click maximizes it and the edges resize it.
 * - `material`: always `none`, the chassis is opaque.
 * - `controls`: `none`.
 */
export interface WindowChrome {
  platform: 'darwin' | 'win32' | 'linux' | 'other';
  material: 'none';
  controls: 'none';
  /** Height in px of the draggable strip along the top edge. */
  titleBarHeight: number;
  theme: ThemeSource;
  state: WindowState;
}

export interface WindowState {
  focused: boolean;
  fullscreen: boolean;
  maximized: boolean;
}

export interface WindowApi {
  getChrome(): Promise<WindowChrome>;
  /** Sets nativeTheme.themeSource so the OS side (menus, dialogs) follows the app theme. */
  setTheme(theme: ThemeSource): Promise<void>;
  /** Closes the window. nvoke stays in the tray. */
  close(): Promise<void>;
  /** Subscribes to focus, fullscreen and maximize changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: WindowState) => void): () => void;
}

export interface WindowBridge {
  window: WindowApi;
}
