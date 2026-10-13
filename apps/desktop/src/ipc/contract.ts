import type { HealthResponse, MeResponse } from '@nvoke/shared';

/**
 * The typed bridge between the renderer and the main process. The preload
 * script exposes exactly this shape on `window.nvoke`, and the main process
 * registers a handler for every channel listed here.
 */

export const IpcChannel = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
  getHealth: 'api:get-health',
  authGetState: 'auth:get-state',
  authSignIn: 'auth:sign-in',
  authCancel: 'auth:cancel',
  authSignOut: 'auth:sign-out',
  /** Main to renderer push, payload AuthState. */
  authChanged: 'auth:changed',
} as const;

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
  | { status: 'signed-in'; user: MeResponse | null };

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
  auth: AuthApi;
}
