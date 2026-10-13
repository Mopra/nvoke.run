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
  ExportResult,
  Me,
  Search,
  SearchInput,
} from './types';
import type { SearchListResponse } from '@nvoke/shared';

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
  if (code === 'quota_exceeded') return 'You have used all emails in your plan for this month.';
  if (status === 0) return 'Could not reach nvoke. Check your connection and try again.';
  if (status === 401) return 'Your session has ended. Sign in again.';
  if (status === 404) return 'That search no longer exists.';
  if (status >= 500) return 'nvoke had a problem on its side. Try again in a moment.';
  return code || `Request failed with status ${status}`;
}

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

  return {
    listSearches: async (): Promise<Search[]> => (await call<SearchListResponse>('GET', '/v1/searches')).searches,
    getSearch: (id: string): Promise<Search> => call('GET', `/v1/searches/${enc(id)}`),
    createSearch: (input: SearchInput): Promise<Search> => call('POST', '/v1/searches', input),
    cancelSearch: (id: string): Promise<Search> => call('POST', `/v1/searches/${enc(id)}/cancel`),
    deleteSearch: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/searches/${enc(id)}`);
    },
    listCompanies: (id: string, query: CompaniesQuery = {}): Promise<CompaniesPage> =>
      call('GET', `/v1/searches/${enc(id)}/companies${buildQuery({ ...query })}`),
    exportCsv: (id: string, defaultFileName: string): Promise<ExportResult> =>
      transport.exportCsv(id, defaultFileName),
    getMe: (): Promise<Me> => call('GET', '/v1/me'),
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
  if (!candidate || typeof candidate.request !== 'function' || !candidate.auth) return null;
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
