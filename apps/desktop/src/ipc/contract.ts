/**
 * The typed bridge between the renderer and the main process. The preload
 * script exposes exactly this shape on `window.nvoke`, and the main process
 * registers a handler for every channel listed here.
 */

export const IpcChannel = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
} as const;

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
  arch: string;
  electron: string;
}

export interface NvokeApi {
  getAppInfo(): Promise<AppInfo>;
  /** Opens an http(s) URL in the system browser. Other schemes are refused. */
  openExternal(url: string): Promise<void>;
}
