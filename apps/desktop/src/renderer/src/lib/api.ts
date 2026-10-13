/**
 * The only data access module in the renderer. Screens call these typed
 * functions and never touch `window.nvoke` or fetch directly.
 *
 * The implementation sits on a `Transport`. Two ship with the app:
 * - `bridge`: `window.nvoke` from the preload (see bridge.d.ts).
 * - `mock`: in memory fake data with simulated progress (mock/transport.ts).
 *   Used when VITE_MOCK=1 or when the bridge is missing, for example when the
 *   renderer is opened in a plain browser.
 */
import type { BridgeResponse, HttpMethod, NvokeBridge } from './bridge';
import { env } from './env';
import { createMockTransport } from './mock/transport';
import type {
  AuthState,
  CompaniesPage,
  CompaniesQuery,
  Drop,
  DropInput,
  DropListResponse,
  DropUpdate,
  ExportResult,
  LocalChange,
  LocalStatus,
  Me,
  Search,
  SearchInput,
} from './types';
import type {
  ApiKey,
  ApiKeyListResponse,
  CreateApiKeyResponse,
  CreateWebhookRequest,
  CreateWebhookResponse,
  SearchListResponse,
  UpdateWebhookRequest,
  Webhook,
  WebhookDelivery,
  WebhookDeliveryListResponse,
  WebhookListResponse,
  WebhookTestResponse,
} from '@nvoke/shared';

export type Transport = NvokeBridge;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(describeError(status, code));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function describeError(status: number, code: string): string {
  if (code === 'quota_exceeded') return 'You’re out of verified emails this month. Upgrade or wait for the reset.';
  if (code === 'source_unavailable') return 'Web search is paused on our side. We know and we’re on it. Local and launch searches still work.';
  if (status === 0) return 'Can’t reach nvoke. Check your connection.';
  if (status === 401) return 'Session expired. Sign in again.';
  if (code === 'api_key_limit') return 'You have 20 keys. Revoke one first.';
  if (code === 'too_many_drops') return 'You have 20 drops. Delete one first.';
  if (code === 'too_many_webhooks') return 'You have 10 webhooks. Delete one first.';
  if (code === 'webhook_url_not_allowed') return 'Use an https URL on a public address.';
  if (status === 404) return 'That search is gone.';
  if (status >= 500) return 'Our server broke. Try again in a minute.';
  return code || `Request failed with status ${status}`;
}

/** Cursors of pages read from the local copy carry this prefix and an offset. */
export const LOCAL_CURSOR = 'local:';

const isNetworkError = (err: unknown): boolean => err instanceof ApiError && err.status === 0;

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export function createApi(transport: Transport) {
  async function call<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    let res: BridgeResponse;
    try {
      res = await transport.request(method, path, body);
    } catch {
      throw new ApiError(0, 'network');
    }
    if (!res.ok) throw new ApiError(res.status, res.error);
    return res.data as T;
  }

  const enc = encodeURIComponent;
  const { local } = transport;

  /** Runs `online`; when the network is down, answers from the local copy if it has one. */
  async function orLocal<T>(online: () => Promise<T>, offline: () => Promise<T | null>): Promise<T> {
    try {
      return await online();
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      const copy = await offline().catch(() => null);
      if (copy === null) throw err;
      return copy;
    }
  }

  /**
   * A finished search's companies come from the local copy when it has them:
   * instant, and offline too. Otherwise, and for a running search, the API.
   */
  async function listCompanies(id: string, query: CompaniesQuery, live: boolean): Promise<CompaniesPage> {
    const { cursor, ...filters } = query;
    if (!live && (!cursor || cursor.startsWith(LOCAL_CURSOR))) {
      const offset = cursor ? Number(cursor.slice(LOCAL_CURSOR.length)) || 0 : 0;
      const page = await local.companies(id, { ...filters, offset }).catch(() => null);
      if (page) {
        const { nextOffset, ...rest } = page;
        return { ...rest, nextCursor: nextOffset === null ? null : `${LOCAL_CURSOR}${nextOffset}` };
      }
      // The copy went away between pages (a sign out or a refresh): stop here.
      if (cursor) return { companies: [], nextCursor: null, total: 0 };
    }
    return call('GET', `/v1/searches/${enc(id)}/companies${buildQuery({ ...query })}`);
  }

  return {
    listSearches: (): Promise<Search[]> =>
      orLocal(async () => (await call<SearchListResponse>('GET', '/v1/searches')).searches, () => local.searches()),
    getSearch: (id: string): Promise<Search> =>
      orLocal(() => call('GET', `/v1/searches/${enc(id)}`), () => local.search(id)),
    createSearch: (input: SearchInput): Promise<Search> => call('POST', '/v1/searches', input),
    cancelSearch: (id: string): Promise<Search> => call('POST', `/v1/searches/${enc(id)}/cancel`),
    deleteSearch: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/searches/${enc(id)}`);
    },
    /** `live` skips the local copy, which only holds finished searches. */
    listCompanies: (id: string, query: CompaniesQuery = {}, live = false): Promise<CompaniesPage> =>
      listCompanies(id, query, live),
    /** Asks main to fetch this search's companies again in the background. */
    refreshLocal: (id: string): Promise<void> => local.refresh(id).catch(() => undefined),
    localStatus: (): Promise<LocalStatus> => local.status(),
    onLocalChange: (callback: (change: LocalChange) => void): (() => void) => local.onChange(callback),
    exportCsv: (id: string, defaultFileName: string): Promise<ExportResult> =>
      transport.exportCsv(id, defaultFileName),
    /** From a `dragstart` handler, after `preventDefault()`: drags `csv` out as a file named `fileName`. */
    startDragCsv: (fileName: string, csv: string): void => transport.startDragCsv(fileName, csv),
    /** `sync` asks the server to re-read the plan from Clerk Billing first. */
    getMe: (sync = false): Promise<Me> => call('GET', sync ? '/v1/me?sync=1' : '/v1/me'),
    listApiKeys: async (): Promise<ApiKey[]> => (await call<ApiKeyListResponse>('GET', '/v1/api-keys')).apiKeys,
    createApiKey: (name: string): Promise<CreateApiKeyResponse> => call('POST', '/v1/api-keys', { name }),
    revokeApiKey: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/api-keys/${enc(id)}`);
    },
    listDrops: (): Promise<DropListResponse> => call('GET', '/v1/drops'),
    createDrop: (input: DropInput): Promise<Drop> => call('POST', '/v1/drops', input),
    updateDrop: (id: string, update: DropUpdate): Promise<Drop> => call('PATCH', `/v1/drops/${enc(id)}`, update),
    /** Runs the drop within a minute instead of at its daily time. */
    runDrop: (id: string): Promise<Drop> => call('POST', `/v1/drops/${enc(id)}/run`),
    deleteDrop: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/drops/${enc(id)}`);
    },
    listWebhooks: async (): Promise<Webhook[]> => (await call<WebhookListResponse>('GET', '/v1/webhooks')).webhooks,
    createWebhook: (input: CreateWebhookRequest): Promise<CreateWebhookResponse> => call('POST', '/v1/webhooks', input),
    updateWebhook: (id: string, update: UpdateWebhookRequest): Promise<Webhook> =>
      call('PATCH', `/v1/webhooks/${enc(id)}`, update),
    deleteWebhook: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/webhooks/${enc(id)}`);
    },
    /** Sends a signed ping now and says how the receiver answered. */
    testWebhook: (id: string): Promise<WebhookTestResponse> => call('POST', `/v1/webhooks/${enc(id)}/test`),
    listWebhookDeliveries: async (id: string): Promise<WebhookDelivery[]> =>
      (await call<WebhookDeliveryListResponse>('GET', `/v1/webhooks/${enc(id)}/deliveries`)).deliveries,
    openExternal: (url: string): Promise<void> => transport.openExternal(url),
    getAuthState: (): Promise<AuthState> => transport.auth.getState(),
    signIn: (): Promise<void> => transport.auth.signIn(),
    cancelSignIn: (): Promise<void> => transport.auth.cancelSignIn(),
    signOut: (): Promise<void> => transport.auth.signOut(),
    onAuthChange: (callback: (state: AuthState) => void): (() => void) => transport.auth.onChange(callback),
  };
}

export type Api = ReturnType<typeof createApi>;

/** Returns the preload bridge if it has the full expected shape. */
export function bridgeFromWindow(): NvokeBridge | null {
  const candidate = (window as unknown as { nvoke?: Partial<NvokeBridge> }).nvoke;
  if (!candidate || typeof candidate.request !== 'function' || !candidate.auth || !candidate.local) return null;
  return candidate as NvokeBridge;
}

function pickTransport(): { transport: Transport; mode: 'mock' | 'bridge' } {
  const bridge = typeof window === 'undefined' ? null : bridgeFromWindow();
  if (env.mock || !bridge) return { transport: createMockTransport(), mode: 'mock' };
  return { transport: bridge, mode: 'bridge' };
}

const picked = pickTransport();

export const transportMode = picked.mode;
export const api = createApi(picked.transport);
