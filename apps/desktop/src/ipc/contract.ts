import type { HealthResponse, User } from '@nvoke/shared';

/**
 * The typed bridge between the renderer and the main process. The preload
 * script exposes exactly this shape on `window.nvoke`, and the main process
 * registers a handler for every channel listed here.
 */

export const IpcChannel = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
  getHealth: 'api:get-health',
  apiRequest: 'api:request',
  exportCsv: 'api:export-csv',
  authGetState: 'auth:get-state',
  authSignIn: 'auth:sign-in',
  authCancel: 'auth:cancel',
  authSignOut: 'auth:sign-out',
  /** Main to renderer push, payload AuthState. */
  authChanged: 'auth:changed',
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

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
  /** Base URL of apps/server, for display. */
  apiUrl: string;
}

/**
 * Sign-in state as the renderer sees it. The device token stays in the main
 * process and never crosses the bridge.
 */
export type AuthState =
  | { status: 'signed-out'; error?: string }
  /** The browser is open on the sign-in page and the app waits for nvoke://auth/callback. */
  | { status: 'pending' }
  /** `user` is null while the profile loads or when the server is unreachable. */
  | { status: 'signed-in'; user: User | null };

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

/**
 * The answer to `request()`. It never rejects: `ok: true` with the parsed JSON
 * body (null for 204), or `ok: false` with the HTTP status and the server's
 * `error` string. Status 0 means the network failed or the call was refused.
 */
export type BridgeResponse = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string };

export type ExportResult =
  /** Written to `filePath`. */
  | { saved: true; filePath: string }
  /** The user dismissed the save dialog, or the export failed with `error`. */
  | { saved: false; error?: string };

export interface AuthApi {
  getState(): Promise<AuthState>;
  /** Opens the sign-in page in the system browser. */
  signIn(): Promise<void>;
  /** Abandons a pending browser sign-in. */
  cancelSignIn(): Promise<void>;
  /** Revokes the device session on the server and forgets the token. */
  signOut(): Promise<void>;
  /** Subscribes to state changes. Returns an unsubscribe function. */
  onChange(listener: (state: AuthState) => void): () => void;
}

export interface NvokeApi {
  getAppInfo(): Promise<AppInfo>;
  /** Opens an http(s) URL in the system browser. Other schemes are refused. */
  openExternal(url: string): Promise<void>;
  /** GET /health on apps/server, called from the main process. */
  getHealth(): Promise<HealthResponse>;
  /**
   * Calls apps/server from the main process, which attaches the device token.
   * `path` must start with `/v1/` and may carry a query string. A 401 signs
   * the app out and fires `auth.onChange`.
   */
  request(method: HttpMethod, path: string, body?: unknown): Promise<BridgeResponse>;
  /**
   * Shows a native save dialog and streams `GET /v1/searches/:id/export.csv`
   * to the chosen file. Never rejects.
   */
  exportCsv(searchId: string, defaultFileName: string): Promise<ExportResult>;
  auth: AuthApi;
  window: WindowApi;
}
