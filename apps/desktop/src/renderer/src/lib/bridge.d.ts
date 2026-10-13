/**
 * The bridge the renderer expects on `window.nvoke`, implemented by the
 * preload script and the main process (src/ipc/contract.ts has the full API
 * and the contract for each call). The renderer never sees the session
 * token: main attaches `Authorization: Bearer` and talks to apps/server.
 *
 * - `request(method, path, body)` calls the API. `path` starts with `/v1/`
 *   and may carry a query string, for example `/v1/searches/abc/companies?q=x`.
 *   It always resolves: `ok: true` with the parsed JSON body (null for 204),
 *   or `ok: false` with the HTTP status and the server's `error` string.
 *   Status 0 means the network failed. A 401 also flips auth to signed out
 *   and fires `auth.onChange`.
 * - `exportCsv(searchId, defaultFileName)` shows a native save dialog and
 *   streams `GET /v1/searches/:id/export.csv` to the chosen file.
 * - `startDragCsv(fileName, csv)` turns a `dragstart` into a native file drag
 *   of a temp CSV, so selected leads drop into other apps.
 * - `auth.signIn()` opens the browser sign-in and moves auth to `pending`;
 *   `auth.cancelSignIn()` abandons it. Completion arrives through `auth.onChange`.
 *
 * This file only declares types. It deliberately does not augment `Window`,
 * because the preload's own declaration owns that; see `bridgeFromWindow`.
 */
import type { NvokeApi } from '../../../ipc/contract';

export type { BridgeResponse, HttpMethod } from '../../../ipc/contract';

export type NvokeAuthBridge = NvokeApi['auth'];

/** The part of `window.nvoke` the data layer uses. The mock transport implements the same. */
export type NvokeBridge = Pick<NvokeApi, 'request' | 'exportCsv' | 'startDragCsv' | 'openExternal' | 'auth'>;
