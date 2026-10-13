/**
 * In memory stand-in for the main process bridge. It answers the same paths
 * as apps/server and simulates the find, crawl and verify pipeline from the
 * wall clock, so polling shows counters climbing without any timers.
 */
import type { BridgeResponse, HttpMethod, NvokeBridge } from '../bridge';
import { companiesToCsv } from '../csv';
import type {
  AuthState,
  CompaniesPage,
  Company,
  EmailKind,
  Me,
  LaunchesParams,
  Plan,
  Search,
  SearchInput,
  SearchStatus,
  User,
  Verification,
} from '../types';
import { API_KEY_PREFIX, PLANS, SEARCH_LIMIT_MAX, type ApiKey } from '@nvoke/shared';
import { generateCompany, sourceYield, type MockCompanySeed } from './data';

const QUEUE_MS = 1500;
const PAGE_SIZE = 100;
/** The mock user is on Pro: see PLANS in apps/server/src/leads/plans.ts. */
const MAX_LIMIT = SEARCH_LIMIT_MAX;
const MOCK_PLAN: Plan = 'emails_2500';

const MOCK_USER: User = {
  id: 'user_mock',
  email: 'mette@nordlys.studio',
  name: 'Mette Lindqvist',
  imageUrl: null,
};

interface SearchRecord {
  id: string;
  input: SearchInput;
  limit: number;
  createdAt: number;
  /** Simulation stops here (cancel or failure). */
  frozenAt: number | null;
  terminal: { status: 'failed' | 'canceled'; error: string | null } | null;
  total: number;
}

interface Progress {
  status: SearchStatus;
  found: number;
  crawled: number;
  verified: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface MockOptions {
  now?: () => number;
  /** Simulated network latency in ms. Zero in tests. */
  latency?: number;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  /** Seed demo searches. Defaults to true. */
  seed?: boolean;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

export function createMockTransport(options: MockOptions = {}): NvokeBridge {
  const now = options.now ?? (() => Date.now());
  const latency = options.latency ?? 260;
  const storage = options.storage ?? (typeof localStorage === 'undefined' ? memoryStorage() : localStorage);

  const searches = new Map<string, SearchRecord>();
  const apiKeys: ApiKey[] = [];
  const seedCache = new Map<string, MockCompanySeed[]>();
  let counter = 0;

  function findDuration(total: number): number {
    return clamp(total * 0.18, 5, 45);
  }

  /** Companies discovered after `t` seconds of running. */
  function foundAt(total: number, t: number): number {
    if (t <= 0) return 0;
    return Math.floor(clamp(t / findDuration(total), 0, 1) * total);
  }

  function progress(rec: SearchRecord): Progress {
    const clock = rec.frozenAt === null ? now() : Math.min(now(), rec.frozenAt);
    const t = (clock - rec.createdAt - QUEUE_MS) / 1000;
    const startedAt = t >= 0 ? rec.createdAt + QUEUE_MS : null;
    const found = foundAt(rec.total, t);
    const crawled = foundAt(rec.total, (t - 2) / 1.2);
    const verified = foundAt(rec.total, (t - 3.5) / 1.2);
    const doneAfter = 3.5 + 1.2 * findDuration(rec.total);

    if (rec.terminal) {
      return { status: rec.terminal.status, found, crawled, verified, startedAt, finishedAt: rec.frozenAt };
    }
    if (t < 0) return { status: 'queued', found: 0, crawled: 0, verified: 0, startedAt: null, finishedAt: null };
    if (t >= doneAfter) {
      return {
        status: 'done',
        found: rec.total,
        crawled: rec.total,
        verified: rec.total,
        startedAt,
        finishedAt: rec.createdAt + QUEUE_MS + doneAfter * 1000,
      };
    }
    return { status: 'running', found, crawled, verified, startedAt, finishedAt: null };
  }

  function seeds(rec: SearchRecord): MockCompanySeed[] {
    let list = seedCache.get(rec.id);
    if (!list) {
      list = Array.from({ length: rec.total }, (_, i) => generateCompany(rec.id, rec.input, i));
      seedCache.set(rec.id, list);
    }
    return list;
  }

  function companiesOf(rec: SearchRecord, p: Progress): Company[] {
    const list = seeds(rec);
    const out: Company[] = [];
    const stamp = new Date(p.startedAt ?? rec.createdAt).toISOString();
    for (let i = 0; i < p.found; i++) {
      const s = list[i]!;
      const crawled = i < p.crawled;
      const verified = i < p.verified;
      out.push({
        ...s.company,
        crawlStatus: crawled ? s.crawlOutcome : 'pending',
        crawledAt: crawled ? stamp : null,
        emails: crawled
          ? s.emails.map((e, k) => ({
              ...e,
              verification: verified ? s.verifications[k]! : null,
              checkedAt: verified ? stamp : null,
            }))
          : [],
      });
    }
    return out;
  }

  function toSearch(rec: SearchRecord): Search {
    const p = progress(rec);
    const companies = companiesOf(rec, p);
    let emailsFound = 0;
    let emailsValid = 0;
    for (const c of companies) {
      emailsFound += c.emails.length;
      emailsValid += c.emails.filter((e) => e.verification === 'valid').length;
    }
    const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
    return {
      id: rec.id,
      kind: rec.input.kind,
      // The server fills in the launches default, so the mock does too.
      params: rec.input.kind === 'launches' ? ({ days: 7, ...rec.input.params } satisfies LaunchesParams) : rec.input.params,
      limit: rec.limit,
      status: p.status,
      error: rec.terminal?.error ?? null,
      companiesFound: p.found,
      companiesCrawled: p.crawled,
      emailsFound,
      emailsValid,
      createdAt: new Date(rec.createdAt).toISOString(),
      startedAt: iso(p.startedAt),
      finishedAt: iso(p.finishedAt),
    } as Search;
  }

  function add(input: SearchInput, createdAt: number, extra: Partial<SearchRecord> = {}): SearchRecord {
    counter += 1;
    const id = `mock-${counter.toString().padStart(4, '0')}`;
    const limit = clamp(input.limit ?? 100, 1, MAX_LIMIT);
    const rec: SearchRecord = {
      id,
      input,
      limit,
      createdAt,
      frozenAt: null,
      terminal: null,
      total: sourceYield(id, limit),
      ...extra,
    };
    searches.set(id, rec);
    return rec;
  }

  if (options.seed !== false) {
    const t0 = now();
    const min = 60_000;
    const day = 24 * 60 * min;
    add({ kind: 'web', params: { keyword: 'accounting software', country: 'GB' }, limit: 200 }, t0 - 6 * day, {
      frozenAt: t0 - 6 * day + QUEUE_MS + 9000,
      terminal: { status: 'canceled', error: null },
    });
    add({ kind: 'web', params: { keyword: 'headless cms', country: 'DE' }, limit: 1000 }, t0 - 3 * day);
    add({ kind: 'launches', params: { keyword: 'ai', days: 7 }, limit: 250 }, t0 - 2 * day, {
      frozenAt: t0 - 2 * day + QUEUE_MS + 21000,
      terminal: { status: 'failed', error: 'quota_exceeded' },
    });
    add({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 100 }, t0 - day - 3 * 60 * min);
    add({ kind: 'local', params: { niche: 'bakeries', location: 'Lisbon' }, limit: 80 }, t0 - 9000);
  }

  function json(status: number, data: unknown): BridgeResponse {
    return { ok: true, status, data };
  }
  function fail(status: number, error: string): BridgeResponse {
    return { ok: false, status, error };
  }

  function validInput(body: unknown): SearchInput | null {
    if (!body || typeof body !== 'object') return null;
    const b = body as { kind?: unknown; params?: Record<string, unknown> };
    const p: Record<string, unknown> = b.params ?? {};
    const text = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
    if (b.kind === 'local' && text(p['niche']) && text(p['location'])) return b as unknown as SearchInput;
    if (b.kind === 'web' && text(p['keyword'])) return b as unknown as SearchInput;
    const days = p['days'];
    const validDays = days === undefined || (typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= 30);
    if (b.kind === 'launches' && validDays) return b as unknown as SearchInput;
    return null;
  }

  function listCompanies(rec: SearchRecord, query: URLSearchParams): CompaniesPage {
    const verification = query.get('verification') as Verification | null;
    const kind = query.get('kind') as EmailKind | null;
    const q = query.get('q')?.trim().toLowerCase() ?? '';
    const offset = Number(query.get('cursor') ?? '0') || 0;

    let list = companiesOf(rec, progress(rec));
    if (verification || kind) {
      list = list
        .map((c) => ({
          ...c,
          emails: c.emails.filter(
            (e) => (!verification || e.verification === verification) && (!kind || e.kind === kind),
          ),
        }))
        .filter((c) => c.emails.length > 0);
    }
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.domain.includes(q) ||
          (c.location ?? '').toLowerCase().includes(q) ||
          c.emails.some((e) => e.address.includes(q)),
      );
    }
    const companies = list.slice(offset, offset + PAGE_SIZE);
    const next = offset + PAGE_SIZE < list.length ? String(offset + PAGE_SIZE) : null;
    return { companies, nextCursor: next, total: list.length };
  }

  function route(method: HttpMethod, path: string, body: unknown): BridgeResponse {
    if (storage.getItem('nvoke.mock.auth') === 'signed-out') return fail(401, 'unauthorized');
    const url = new URL(path, 'http://mock.local');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'v1') return fail(404, 'not_found');

    if (parts[1] === 'me' && method === 'GET') {
      const period = new Date(now()).toISOString().slice(0, 7);
      const used = [...searches.values()]
        .filter((r) => new Date(r.createdAt).toISOString().startsWith(period))
        .reduce((sum, r) => sum + toSearch(r).emailsValid, 0);
      const me: Me = {
        user: MOCK_USER,
        via: 'device',
        plan: MOCK_PLAN,
        usage: { period, emailsVerified: used + 412, emailsLimit: PLANS[MOCK_PLAN].emailsPerMonth },
        maxSearchLimit: MAX_LIMIT,
        account: { createdBy: 'human', agentName: null, claimedAt: new Date(now()).toISOString() },
        billingUrl: 'https://nvoke.run/desktop/billing',
      };
      return json(200, me);
    }

    if (parts[1] === 'api-keys') return apiKeyRoute(method, parts[2], body);

    if (parts[1] !== 'searches') return fail(404, 'not_found');

    if (parts.length === 2) {
      if (method === 'GET') {
        const items = [...searches.values()].sort((a, b) => b.createdAt - a.createdAt).map(toSearch);
        return json(200, { searches: items });
      }
      if (method === 'POST') {
        const input = validInput(body);
        if (!input) return fail(400, 'invalid_request');
        return json(201, toSearch(add(input, now())));
      }
    }

    const rec = searches.get(parts[2] ?? '');
    if (!rec) return fail(404, 'not_found');

    if (parts.length === 3 && method === 'GET') return json(200, toSearch(rec));
    if (parts.length === 3 && method === 'DELETE') {
      searches.delete(rec.id);
      seedCache.delete(rec.id);
      return json(204, null);
    }
    if (parts[3] === 'cancel' && method === 'POST') {
      const status = progress(rec).status;
      if (status === 'queued' || status === 'running') {
        rec.frozenAt = now();
        rec.terminal = { status: 'canceled', error: null };
      }
      return json(200, toSearch(rec));
    }
    if (parts[3] === 'companies' && method === 'GET') return json(200, listCompanies(rec, url.searchParams));
    return fail(404, 'not_found');
  }

  function randomKey(): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
    let out = API_KEY_PREFIX;
    for (let i = 0; i < 43; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
    return out;
  }

  function addKey(name: string, origin: ApiKey['origin'], createdAt: number, lastUsedAt: number | null): string {
    const key = randomKey();
    apiKeys.unshift({
      id: crypto.randomUUID(),
      name,
      prefix: key.slice(0, API_KEY_PREFIX.length + 4),
      origin,
      createdAt: new Date(createdAt).toISOString(),
      lastUsedAt: lastUsedAt === null ? null : new Date(lastUsedAt).toISOString(),
    });
    return key;
  }

  if (options.seed !== false) {
    const t0 = now();
    addKey('Claude', 'agent_signup', t0 - 12 * 86_400_000, t0 - 40 * 60_000);
    addKey('CRM sync', 'user', t0 - 3 * 86_400_000, null);
  }

  /** GET, POST /v1/api-keys and DELETE /v1/api-keys/:id, as the server answers them. */
  function apiKeyRoute(method: HttpMethod, id: string | undefined, body: unknown): BridgeResponse {
    if (id === undefined && method === 'GET') return json(200, { apiKeys: [...apiKeys] });
    if (id === undefined && method === 'POST') {
      const name = typeof (body as { name?: unknown } | null)?.name === 'string' ? (body as { name: string }).name.trim() : '';
      if (!name || name.length > 60) return fail(400, 'invalid_request');
      if (apiKeys.length >= 20) return fail(409, 'api_key_limit');
      const key = addKey(name, 'user', now(), null);
      return json(201, { ...apiKeys[0]!, key });
    }
    if (id !== undefined && method === 'DELETE') {
      const i = apiKeys.findIndex((k) => k.id === id);
      if (i < 0) return fail(404, 'not_found');
      apiKeys.splice(i, 1);
      return json(204, null);
    }
    return fail(404, 'not_found');
  }

  const sleep = (ms: number): Promise<void> => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
  const jitter = (): number => (latency > 0 ? latency * (0.6 + Math.random() * 0.8) : 0);

  const listeners = new Set<(state: AuthState) => void>();
  let pending: ReturnType<typeof setTimeout> | null = null;
  const authState = (): AuthState =>
    pending
      ? { status: 'pending' }
      : storage.getItem('nvoke.mock.auth') === 'signed-out'
        ? { status: 'signed-out' }
        : { status: 'signed-in', user: MOCK_USER };
  const emit = (): void => {
    const state = authState();
    for (const l of listeners) l(state);
  };

  return {
    async request(method, path, body) {
      await sleep(jitter());
      return route(method, path, body);
    },
    async exportCsv(searchId, defaultFileName) {
      await sleep(jitter());
      const rec = searches.get(searchId);
      if (!rec) return { saved: false, error: 'That search no longer exists.' };
      const csv = companiesToCsv(companiesOf(rec, progress(rec)));
      if (typeof document !== 'undefined') {
        const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = href;
        a.download = defaultFileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(href), 1000);
      }
      return { saved: true, filePath: `Downloads/${defaultFileName}` };
    },
    async openExternal(url) {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    },
    auth: {
      async getState() {
        await sleep(jitter());
        return authState();
      },
      async signIn() {
        // Stands in for the browser round trip: pending until it "returns".
        if (pending) clearTimeout(pending);
        pending = setTimeout(
          () => {
            pending = null;
            storage.setItem('nvoke.mock.auth', 'signed-in');
            emit();
          },
          latency > 0 ? 1800 : 0,
        );
        emit();
      },
      async cancelSignIn() {
        if (!pending) return;
        clearTimeout(pending);
        pending = null;
        emit();
      },
      async signOut() {
        await sleep(jitter());
        storage.setItem('nvoke.mock.auth', 'signed-out');
        emit();
      },
      onChange(callback) {
        listeners.add(callback);
        return () => listeners.delete(callback);
      },
    },
  };
}
