export const WindowChannel = {
  windowGetChrome: 'window:get-chrome',
  windowSetTheme: 'window:set-theme',
  windowSetTitleBarColors: 'window:set-title-bar-colors',
  /** Main to renderer push, payload WindowState. */
  windowStateChanged: 'window:state-changed',
} as const;

/** The appearance the user picked. `system` follows the OS. */
export type ThemeSource = 'system' | 'light' | 'dark';

/**
 * How the frameless window is dressed on this platform, so the renderer can
 * leave room for the native controls and let the material show through.
 * - `material`: `vibrancy` (macOS), `mica` (Windows 11) or `none` (opaque).
 * - `controls`: `traffic-lights` sit top left in the sidebar (macOS),
 *   `overlay` buttons sit top right over the toolbar (Windows, Linux).
 */
export interface WindowChrome {
  platform: 'darwin' | 'win32' | 'linux' | 'other';
  material: 'vibrancy' | 'mica' | 'none';
  controls: 'traffic-lights' | 'overlay';
  /** Height in px of the draggable title strip the controls live in. */
  titleBarHeight: number;
  theme: ThemeSource;
  state: WindowState;
}

export interface WindowState {
  focused: boolean;
  fullscreen: boolean;
  maximized: boolean;
}

/** Colors for the Windows and Linux caption buttons, as #rrggbb. The background may be `transparent`. */
export interface TitleBarColors {
  color: string;
  symbolColor: string;
}

export interface WindowApi {
  getChrome(): Promise<WindowChrome>;
  /** Sets nativeTheme.themeSource so the window material follows the app theme. */
  setTheme(theme: ThemeSource): Promise<void>;
  /** Repaints the native caption buttons to match the toolbar. No-op on macOS. */
  setTitleBarColors(colors: TitleBarColors): Promise<void>;
  /** Subscribes to focus, fullscreen and maximize changes. Returns an unsubscribe function. */
  onStateChange(listener: (state: WindowState) => void): () => void;
}

export interface WindowBridge {
  window: WindowApi;
}
