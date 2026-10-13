/**
 * The bridge the renderer expects on `window.nvoke`, implemented by the
 * preload script and the main process. The renderer never sees the session
 * token: main attaches `Authorization: Bearer` and talks to apps/server.
 *
 * Contract:
 * - `request(method, path, body)` calls the API. `path` includes the version
 *   prefix and query string, for example `/v1/searches/abc/companies?q=x`.
 *   It always resolves (IPC rejections lose their shape): `ok: true` with the
 *   parsed JSON body (null for 204), or `ok: false` with the HTTP status and
 *   the server's `error` string. Status 0 means the network failed. A 401 also
 *   flips auth to signed out and fires `auth.onChange`.
 * - `exportCsv(searchId, defaultFileName)` shows a native save dialog, streams
 *   `GET /v1/searches/:id/export.csv` to the chosen file and reports where.
 * - `openExternal(url)` opens an http(s) URL in the system browser.
 * - `auth.getState()` returns the current state, read from the stored session.
 * - `auth.signIn()` opens the system browser sign-in flow and resolves once it
 *   has started. Completion arrives later through `auth.onChange`.
 * - `auth.signOut()` revokes and forgets the stored session.
 * - `auth.onChange(cb)` subscribes to auth changes and returns an unsubscribe.
 *
 * This file only declares types. It deliberately does not augment `Window`,
 * because the preload's own declaration owns that; see `bridgeFromWindow`.
 */
import type { AuthState, ExportResult } from './types';

export type HttpMethod = 'GET' | 'POST' | 'DELETE';

export type BridgeResponse = { ok: true; status: number; data: unknown } | { ok: false; status: number; error: string };

export interface NvokeAuthBridge {
  getState(): Promise<AuthState>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  onChange(callback: (state: AuthState) => void): () => void;
}

export interface NvokeBridge {
  request(method: HttpMethod, path: string, body?: unknown): Promise<BridgeResponse>;
  exportCsv(searchId: string, defaultFileName: string): Promise<ExportResult>;
  openExternal(url: string): Promise<void>;
  auth: NvokeAuthBridge;
}
