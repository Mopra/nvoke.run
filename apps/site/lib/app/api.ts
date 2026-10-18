import type {
  ApiKey,
  ApiKeyListResponse,
  CompaniesPage,
  CreateApiKeyResponse,
  CreateSearchInput,
  DraftOpenersInput,
  DraftOpenersResponse,
  LeadFilters,
  MeResponse,
  Search,
  SearchListResponse,
  SiteProfile,
  UpdateSearchRequest,
  UpdateSiteProfileRequest,
} from '@nvoke/shared';

/**
 * The web app's only way to the nvoke API. The browser calls `/v1` on
 * apps/server directly with the Clerk session JWT as the bearer token, the
 * same routes and shapes the desktop app uses through its main process.
 */

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/** Returns a fresh Clerk session token, or null when signed out. */
export type TokenSource = () => Promise<string | null>;

/** Filters for `GET /v1/searches/:id/companies`, plus the page cursor and size. */
export type CompaniesQuery = LeadFilters & { cursor?: string; limit?: number };

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** Sent with `quota_exceeded`: where to upgrade. */
  readonly billingUrl: string | null;
  /** Sent with some codes to say which case it was, like `site_unreadable`'s `blocked`. */
  readonly detail: string | null;

  constructor(status: number, code: string, billingUrl: string | null = null, detail: string | null = null) {
    super(describeError(status, code));
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.billingUrl = billingUrl;
    this.detail = detail;
  }
}

export function describeError(status: number, code: string): string {
  if (code === 'quota_exceeded') return 'You’re out of verified emails this month. Upgrade or wait for the reset.';
  if (code === 'source_unavailable') {
    return 'Web search is paused on our side. We know and we’re on it. Local and launch searches still work.';
  }
  if (code === 'claim_required') return 'This account needs to be claimed first. Check the email we sent.';
  if (code === 'api_key_limit') return 'You have 20 keys. Revoke one first.';
  if (code === 'site_unreadable') return 'We couldn’t read that website.';
  if (code === 'ai_unavailable') return 'Claude isn’t answering right now. Try again in a few minutes.';
  if (code === 'cancelled') return 'Stopped.';
  if (code === 'search_running') return 'This search is still running. Search more once it finishes.';
  if (code === 'kind_mismatch') return 'A search runs again with its own kind. Start a new search for another kind.';
  if (status === 0) return 'Can’t reach nvoke. Check your connection.';
  if (status === 401) return 'Your session expired. Sign in again.';
  if (status === 404) return 'That search is gone.';
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'Our server broke. Try again in a minute.';
  if (code === 'invalid_request') return 'Something in the form is off. Check it and try again.';
  return code || `Request failed with status ${status}`;
}

export function isQuotaError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'quota_exceeded';
}

/** A query string from params; empty, undefined and false values are left out, true is sent as `true`. */
export function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '' || value === false) continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

interface ErrorBody {
  code: string;
  billingUrl: string | null;
  detail: string | null;
}

/** Reads `{ error, billingUrl, detail }` from an error answer. Anything else gives an empty code. */
async function readError(res: Response): Promise<ErrorBody> {
  const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  try {
    const data: unknown = await res.json();
    if (data && typeof data === 'object') {
      const { error, billingUrl, detail } = data as { error?: unknown; billingUrl?: unknown; detail?: unknown };
      return { code: text(error) ?? '', billingUrl: text(billingUrl), detail: text(detail) };
    }
  } catch {
    // Not JSON: a proxy page or an empty body.
  }
  return { code: '', billingUrl: null, detail: null };
}

export interface WebApiOptions {
  baseUrl: string;
  getToken: TokenSource;
  fetch?: typeof fetch;
}

export function createWebApi({ baseUrl, getToken, fetch: fetchImpl = (...args) => fetch(...args) }: WebApiOptions) {
  const base = baseUrl.replace(/\/+$/, '');
  const enc = encodeURIComponent;

  async function send(method: HttpMethod, path: string, body?: unknown, signal?: AbortSignal): Promise<Response> {
    const token = await getToken().catch(() => null);
    if (!token) throw new ApiError(401, 'unauthorized');
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch {
      throw new ApiError(0, signal?.aborted ? 'cancelled' : 'network');
    }
    if (!res.ok) {
      const { code, billingUrl, detail } = await readError(res);
      if (signal?.aborted) throw new ApiError(0, 'cancelled');
      throw new ApiError(res.status, code, billingUrl, detail);
    }
    return res;
  }

  async function call<T>(method: HttpMethod, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await send(method, path, body, signal);
    let text: string;
    try {
      text = await res.text();
    } catch {
      throw new ApiError(0, signal?.aborted ? 'cancelled' : 'network');
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  return {
    listSearches: async (): Promise<Search[]> => (await call<SearchListResponse>('GET', '/v1/searches')).searches,
    getSearch: (id: string): Promise<Search> => call('GET', `/v1/searches/${enc(id)}`),
    createSearch: (input: CreateSearchInput): Promise<Search> => call('POST', '/v1/searches', input),
    /** Runs an ended search again with new params of its kind; only companies it does not hold yet are added. */
    searchMore: (id: string, input: CreateSearchInput): Promise<Search> => call('POST', `/v1/searches/${enc(id)}/more`, input),
    cancelSearch: (id: string): Promise<Search> => call('POST', `/v1/searches/${enc(id)}/cancel`),
    /** ongoing: a plain words search keeps finding new companies until it is off. checkInboxes: shared inboxes are checked too. */
    updateSearch: (id: string, patch: UpdateSearchRequest): Promise<Search> => call('PATCH', `/v1/searches/${enc(id)}`, patch),
    deleteSearch: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/searches/${enc(id)}`);
    },
    listCompanies: (id: string, query: CompaniesQuery = {}): Promise<CompaniesPage> =>
      call('GET', `/v1/searches/${enc(id)}/companies${buildQuery({ ...query })}`),
    /** The server's CSV (one row per email), with the same filters as the list. */
    exportCsv: async (id: string, filters: LeadFilters = {}): Promise<Blob> =>
      (await send('GET', `/v1/searches/${enc(id)}/export.csv${buildQuery({ ...filters })}`)).blob(),
    /** Queues an opener per company with a valid email (202). They turn up on the companies as Claude writes them. */
    draftOpeners: (id: string, body: DraftOpenersInput = {}): Promise<DraftOpenersResponse> =>
      call('POST', `/v1/searches/${enc(id)}/openers`, body),
    /** `sync` makes the server re-read the plan from Clerk Billing first. */
    getMe: (sync = false): Promise<MeResponse> => call('GET', sync ? '/v1/me?sync=1' : '/v1/me'),
    listApiKeys: async (): Promise<ApiKey[]> => (await call<ApiKeyListResponse>('GET', '/v1/api-keys')).apiKeys,
    createApiKey: (name: string): Promise<CreateApiKeyResponse> => call('POST', '/v1/api-keys', { name }),
    revokeApiKey: async (id: string): Promise<void> => {
      await call<null>('DELETE', `/v1/api-keys/${enc(id)}`);
    },
    /** The account's site profile, or null before the first one is built. */
    getSiteProfile: async (): Promise<SiteProfile | null> => {
      try {
        return await call<SiteProfile>('GET', '/v1/site-profile');
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    /** Reads the site and plans searches. Takes 10 to 30 seconds. Aborting `signal` hangs up, and the server stops reading. */
    buildSiteProfile: (website: string, signal?: AbortSignal): Promise<SiteProfile> =>
      call('POST', '/v1/site-profile', { website }, signal),
    updateSiteProfile: (patch: UpdateSiteProfileRequest): Promise<SiteProfile> => call('PATCH', '/v1/site-profile', patch),
    deleteSiteProfile: async (): Promise<void> => {
      await call<null>('DELETE', '/v1/site-profile');
    },
  };
}

export type WebApi = ReturnType<typeof createWebApi>;
