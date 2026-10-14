export const ApiChannel = {
  apiRequest: 'api:request',
  exportCsv: 'api:export-csv',
} as const;

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

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

export interface ApiBridge {
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
}
