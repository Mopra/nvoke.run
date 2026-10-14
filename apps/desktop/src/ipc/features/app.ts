import type { HealthResponse } from '@nvoke/shared';

export const AppChannel = {
  getAppInfo: 'app:get-info',
  openExternal: 'app:open-external',
  getHealth: 'api:get-health',
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

export interface AppBridge {
  getAppInfo(): Promise<AppInfo>;
  /** Opens an http(s) URL in the system browser. Other schemes are refused. */
  openExternal(url: string): Promise<void>;
  /** GET /health on apps/server, called from the main process. */
  getHealth(): Promise<HealthResponse>;
}
