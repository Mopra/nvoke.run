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
  Drop,
  Opener,
  DropRunParams,
  FeedSource,
  EmailKind,
  LocalStatus,
  Me,
  LaunchesParams,
  Plan,
  Search,
  SearchInput,
  SearchStatus,
  User,
  Verification,
} from '../types';
import {
  API_KEY_PREFIX,
  CreateDropRequest,
  DROP_DAILY_LIMIT_DEFAULT,
  FEED_SOURCES,
  PLANS,
  SEARCH_LIMIT_MAX,
  CreateWebhookRequest,
  BuildSiteProfileRequest,
  DraftOpenersRequest,
  UpdateDropRequest,
  UpdateSiteProfileRequest,
  UpdateWebhookRequest,
  WEBHOOK_EVENTS,
  WEBHOOK_SECRET_PREFIX,
  WEBHOOKS_MAX,
  type ApiKey,
  type SiteProfile,
  type Webhook,
} from '@nvoke/shared';
import { generateCompany, mockOpener, mockSiteProfile, sourceYield, type MockCompanySeed } from './data';

const QUEUE_MS = 1500;
/** How long Claude takes over one opener, before the stagger across a batch. */
const OPENER_MS = 1800;
/** How long a mock site profile build takes, long enough to show the phases. */
const SITE_PROFILE_MS = 5200;
/** The built profile survives a reload in dev, like the server keeps it. */
const SITE_PROFILE_KEY = 'nvoke.mock.site-profile';
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
  /** Set when a drop made this search. The input then only seeds the fake companies. */
  dropRun?: DropRunParams;
  /** When each company's opener was queued, by company id. */
  openers?: Map<string, number>;
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
  const drops: Drop[] = [];
  const webhooks: Webhook[] = [];
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
        localCrawl: crawled ? s.localCrawl : null,
        emails: crawled
          ? s.emails.map((e, k) => ({
              ...e,
              verification: verified ? s.verifications[k]! : null,
              checkedAt: verified ? stamp : null,
            }))
          : [],
        opener: openerOf(rec, i),
      });
    }
    return out;
  }

  /** Queued for a moment after it was asked for, then drafted. Staggered, like batches finishing. */
  function openerOf(rec: SearchRecord, index: number): Opener | null {
    const seed = seeds(rec)[index]!;
    const queuedAt = rec.openers?.get(seed.company.id);
    if (queuedAt === undefined) return null;
    const doneAt = queuedAt + OPENER_MS + (index % 8) * 250;
    if (now() < doneAt) return { status: 'queued', line: null, sourceUrl: null, quote: null, draftedAt: null };
    return mockOpener(seed.company, index, new Date(doneAt).toISOString());
  }

  /** POST /v1/searches/:id/openers: queues the companies with a valid email that have no opener yet, or all of them on `redo`. */
  function draftOpeners(rec: SearchRecord, body: unknown): BridgeResponse {
    // Mock company ids are not uuids, so the ids are checked as plain strings.
    const req = DraftOpenersRequest.omit({ companyIds: true }).safeParse(body ?? {});
    const ids = (body as { companyIds?: unknown } | null)?.companyIds;
    const idsOk = ids === undefined || (Array.isArray(ids) && ids.length > 0 && ids.every((i) => typeof i === 'string'));
    if (!req.success || !idsOk) return fail(400, 'invalid_request');
    const companyIds = ids as string[] | undefined;
    const { redo } = req.data;
    const wanted = companyIds ? new Set(companyIds) : null;
    const openers = (rec.openers ??= new Map());
    let queued = 0;
    let skipped = 0;
    for (const c of companiesOf(rec, progress(rec))) {
      if (wanted && !wanted.has(c.id)) continue;
      const eligible = c.emails.some((e) => e.verification === 'valid');
      const has = c.opener?.status === 'done' || c.opener?.status === 'queued';
      if (!eligible || (has && !redo)) {
        skipped += 1;
        continue;
      }
      openers.set(c.id, now());
      queued += 1;
    }
    return json(202, { queued, skipped });
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
    const search = {
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
    return rec.dropRun ? ({ ...search, kind: 'drop', params: rec.dropRun } as Search) : search;
  }

  function add(input: SearchInput, createdAt: number, extra: Partial<SearchRecord> = {}): SearchRecord {
    counter += 1;
    const id = `mock-${counter.toString().padStart(4, '0')}`;
    // A list is as long as it is, like on the server.
    if (input.kind === 'domains') input = { ...input, params: { ...input.params, items: input.params.items.slice(0, clamp(input.limit ?? MAX_LIMIT, 1, MAX_LIMIT)) } };
    const limit = input.kind === 'domains' ? input.params.items.length : clamp(input.limit ?? 100, 1, MAX_LIMIT);
    const rec: SearchRecord = {
      id,
      input,
      limit,
      createdAt,
      frozenAt: null,
      terminal: null,
      // Every domain is found; a name now and then has no website.
      total: input.kind === 'domains' ? Math.max(1, limit - Math.floor(limit / 9)) : sourceYield(id, limit),
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
    add(
      {
        kind: 'domains',
        params: { items: ['linear.app', 'vercel.com', 'Pleo', 'https://www.figma.com', 'Too Good To Go', 'raycast.com', 'Lunar'] },
      },
      t0 - day - 6 * 60 * min,
    );
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
    const items = p['items'];
    if (b.kind === 'domains' && Array.isArray(items) && items.length > 0 && items.length <= MAX_LIMIT && items.every(text)) {
      return b as unknown as SearchInput;
    }
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

  const signedOut = (): boolean => storage.getItem('nvoke.mock.auth') === 'signed-out';
  /** `nvoke.mock.offline=1` in storage cuts the network, so the app runs on its local copy. */
  const offline = (): boolean => storage.getItem('nvoke.mock.offline') === '1';
  /** The local copy holds finished searches, like the one main keeps in SQLite. */
  const synced = (rec: SearchRecord): boolean => {
    const status = progress(rec).status;
    return status !== 'queued' && status !== 'running';
  };
  const sortedSearches = (): SearchRecord[] => [...searches.values()].sort((a, b) => b.createdAt - a.createdAt);

  function localStatus(): LocalStatus {
    if (signedOut()) return { online: null, syncing: false, syncedAt: null, searches: 0, companies: 0, emails: 0 };
    let companies = 0;
    let emails = 0;
    for (const rec of searches.values()) {
      if (!synced(rec)) continue;
      const list = companiesOf(rec, progress(rec));
      companies += list.length;
      emails += list.reduce((sum, c) => sum + c.emails.length, 0);
    }
    return {
      online: !offline(),
      syncing: false,
      syncedAt: new Date(now() - (offline() ? 42 * 60_000 : 20_000)).toISOString(),
      searches: searches.size,
      companies,
      emails,
    };
  }

  function route(method: HttpMethod, path: string, body: unknown): BridgeResponse {
    if (signedOut()) return fail(401, 'unauthorized');
    if (offline()) return fail(0, 'network');
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

    if (parts[1] === 'site-profile' && parts.length === 2) return siteProfileRoute(method, body);
    if (parts[1] === 'api-keys') return apiKeyRoute(method, parts[2], body);
    if (parts[1] === 'drops') return dropRoute(method, parts[2], parts[3], body);
    if (parts[1] === 'webhooks') return webhookRoute(method, parts[2], parts[3], body);

    if (parts[1] !== 'searches') return fail(404, 'not_found');

    if (parts.length === 2) {
      if (method === 'GET') {
        const items = sortedSearches().map(toSearch);
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
    if (parts[3] === 'openers' && method === 'POST') return draftOpeners(rec, body);
    return fail(404, 'not_found');
  }

  function storedSiteProfile(): SiteProfile | null {
    try {
      const raw = storage.getItem(SITE_PROFILE_KEY);
      return raw ? (JSON.parse(raw) as SiteProfile) : null;
    } catch {
      return null;
    }
  }

  /**
   * GET, POST and PATCH /v1/site-profile. Any site works except one under
   * `.invalid`, which answers like a site that does not resolve.
   */
  function siteProfileRoute(method: HttpMethod, body: unknown): BridgeResponse {
    const current = storedSiteProfile();
    if (method === 'GET') return current ? json(200, current) : fail(404, 'not_found');
    if (method === 'POST') {
      const req = BuildSiteProfileRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      const text = req.data.website.trim();
      let host: string;
      try {
        host = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`).hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        return fail(400, 'invalid_request');
      }
      if (!host.includes('.')) return fail(400, 'invalid_request');
      if (host.endsWith('.invalid')) return { ok: false, status: 422, error: 'site_unreadable', detail: 'unreachable' };
      const profile = mockSiteProfile(host, new Date(now()).toISOString());
      storage.setItem(SITE_PROFILE_KEY, JSON.stringify(profile));
      return json(200, profile);
    }
    if (method === 'PATCH') {
      if (!current) return fail(404, 'not_found');
      const req = UpdateSiteProfileRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      const next: SiteProfile = { ...current, profile: { ...current.profile, ...req.data }, updatedAt: new Date(now()).toISOString() };
      storage.setItem(SITE_PROFILE_KEY, JSON.stringify(next));
      return json(200, next);
    }
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

  /** Delivers a drop's launches as a search, the way the worker's daily run does. */
  function deliverDrop(drop: Drop, at: number): void {
    add({ kind: 'launches', params: { keyword: drop.keyword ?? undefined, days: 1 }, limit: drop.dailyLimit }, at, {
      dropRun: { dropId: drop.id, dropName: drop.name, keyword: drop.keyword ?? undefined, sources: drop.sources },
    });
    drop.lastDeliveredAt = new Date(at).toISOString();
    drop.nextRunAt = new Date(at + 86_400_000).toISOString();
  }

  function withDelivered(drop: Drop): Drop {
    const delivered = [...searches.values()]
      .filter((r) => r.dropRun?.dropId === drop.id)
      .reduce((sum, r) => sum + progress(r).found, 0);
    return { ...drop, companiesDelivered: delivered };
  }

  if (options.seed !== false) {
    const t0 = now();
    const hour = 3_600_000;
    const agents: Drop = {
      id: crypto.randomUUID(),
      name: 'AI agents',
      keyword: 'agent',
      sources: [...FEED_SOURCES],
      dailyLimit: 25,
      enabled: true,
      nextRunAt: '',
      lastDeliveredAt: null,
      companiesDelivered: 0,
      createdAt: new Date(t0 - 9 * 24 * hour).toISOString(),
    };
    const fintech: Drop = {
      ...agents,
      id: crypto.randomUUID(),
      name: 'YC fintech',
      keyword: 'fintech',
      sources: ['yc', 'launch_hn'],
      dailyLimit: 10,
      enabled: false,
      createdAt: new Date(t0 - 20 * 24 * hour).toISOString(),
    };
    deliverDrop(fintech, t0 - 4 * 24 * hour);
    deliverDrop(agents, t0 - 26 * hour);
    deliverDrop(agents, t0 - 2 * hour);
    drops.push(agents, fintech);
  }

  const MOCK_FEED: Record<FeedSource, number> = { show_hn: 173, launch_hn: 4, product_hunt: 0, yc: 134 };

  /** GET, POST /v1/drops, PATCH and DELETE /v1/drops/:id, POST /v1/drops/:id/run. */
  function dropRoute(method: HttpMethod, id: string | undefined, action: string | undefined, body: unknown): BridgeResponse {
    if (id === undefined && method === 'GET') {
      return json(200, {
        drops: drops.map(withDelivered),
        sources: FEED_SOURCES.map((source) => ({
          source,
          available: source !== 'product_hunt',
          lastWeek: MOCK_FEED[source],
          lastCollectedAt: source === 'product_hunt' ? null : new Date(now() - 12 * 60_000).toISOString(),
        })),
      });
    }
    if (id === undefined && method === 'POST') {
      const req = CreateDropRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      if (drops.length >= 20) return fail(409, 'too_many_drops');
      const drop: Drop = {
        id: crypto.randomUUID(),
        name: req.data.name,
        keyword: req.data.keyword ?? null,
        sources: req.data.sources ?? [...FEED_SOURCES],
        dailyLimit: req.data.dailyLimit ?? DROP_DAILY_LIMIT_DEFAULT,
        enabled: true,
        nextRunAt: new Date(now()).toISOString(),
        lastDeliveredAt: null,
        companiesDelivered: 0,
        createdAt: new Date(now()).toISOString(),
      };
      drops.unshift(drop);
      // The first run happens within a minute; the demo runs it at once.
      deliverDrop(drop, now());
      return json(201, withDelivered(drop));
    }
    const drop = drops.find((d) => d.id === id);
    if (!drop) return fail(404, 'not_found');
    if (action === undefined && method === 'PATCH') {
      const req = UpdateDropRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      const u = req.data;
      if (u.name !== undefined) drop.name = u.name;
      if (u.keyword !== undefined) drop.keyword = u.keyword;
      if (u.sources !== undefined) drop.sources = u.sources;
      if (u.dailyLimit !== undefined) drop.dailyLimit = u.dailyLimit;
      if (u.enabled !== undefined) drop.enabled = u.enabled;
      return json(200, withDelivered(drop));
    }
    if (action === 'run' && method === 'POST') {
      drop.enabled = true;
      deliverDrop(drop, now());
      return json(200, withDelivered(drop));
    }
    if (action === undefined && method === 'DELETE') {
      drops.splice(drops.indexOf(drop), 1);
      return json(204, null);
    }
    return fail(404, 'not_found');
  }

  if (options.seed !== false) {
    const t0 = now();
    webhooks.push({
      id: crypto.randomUUID(),
      url: 'https://hooks.zapier.com/hooks/catch/1874213/3vq9x2k/',
      events: [...WEBHOOK_EVENTS],
      scope: 'drops',
      dropId: null,
      enabled: true,
      disabledReason: null,
      lastSuccessAt: new Date(t0 - 2 * 3_600_000 + 4 * 60_000).toISOString(),
      lastFailureAt: null,
      lastError: null,
      createdAt: new Date(t0 - 8 * 86_400_000).toISOString(),
    });
  }

  /** GET, POST /v1/webhooks, PATCH and DELETE /v1/webhooks/:id, POST :id/test and GET :id/deliveries. */
  function webhookRoute(method: HttpMethod, id: string | undefined, action: string | undefined, body: unknown): BridgeResponse {
    const publicHttps = (url: string): boolean => {
      try {
        const u = new URL(url);
        return u.protocol === 'https:' && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname);
      } catch {
        return false;
      }
    };
    if (id === undefined && method === 'GET') return json(200, { webhooks: [...webhooks] });
    if (id === undefined && method === 'POST') {
      const req = CreateWebhookRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      if (!publicHttps(req.data.url)) return fail(422, 'webhook_url_not_allowed');
      if (webhooks.length >= WEBHOOKS_MAX) return fail(409, 'too_many_webhooks');
      const webhook: Webhook = {
        id: crypto.randomUUID(),
        url: req.data.url,
        events: req.data.events ?? [...WEBHOOK_EVENTS],
        scope: req.data.dropId ? 'drops' : (req.data.scope ?? 'all'),
        dropId: req.data.dropId ?? null,
        enabled: true,
        disabledReason: null,
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
        createdAt: new Date(now()).toISOString(),
      };
      webhooks.unshift(webhook);
      const secret = `${WEBHOOK_SECRET_PREFIX}${btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))}`;
      return json(201, { ...webhook, secret });
    }
    const webhook = webhooks.find((w) => w.id === id);
    if (!webhook) return fail(404, 'not_found');
    if (action === undefined && method === 'PATCH') {
      const req = UpdateWebhookRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      const u = req.data;
      if (u.url !== undefined) {
        if (!publicHttps(u.url)) return fail(422, 'webhook_url_not_allowed');
        webhook.url = u.url;
      }
      if (u.events !== undefined) webhook.events = u.events;
      if (u.scope !== undefined) webhook.scope = u.scope;
      if (u.dropId !== undefined) webhook.dropId = u.dropId;
      if (u.dropId) webhook.scope = 'drops';
      if (u.enabled !== undefined) {
        webhook.enabled = u.enabled;
        webhook.disabledReason = null;
      }
      return json(200, { ...webhook });
    }
    if (action === undefined && method === 'DELETE') {
      webhooks.splice(webhooks.indexOf(webhook), 1);
      return json(204, null);
    }
    if (action === 'test' && method === 'POST') {
      webhook.lastSuccessAt = new Date(now()).toISOString();
      return json(200, { ok: true, status: 200, error: null, durationMs: 140 });
    }
    if (action === 'deliveries' && method === 'GET') return json(200, { deliveries: [] });
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
      if (method === 'POST' && path === '/v1/site-profile' && latency > 0) await sleep(SITE_PROFILE_MS);
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
    startDragCsv(fileName, csv) {
      // Inside Electron with VITE_MOCK the preload is still there, so the drag works on demo data.
      const real = typeof window === 'undefined' ? undefined : (window as { nvoke?: { startDragCsv?: (f: string, c: string) => void } }).nvoke;
      real?.startDragCsv?.(fileName, csv);
    },
    async openExternal(url) {
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    },
    local: {
      async searches() {
        return signedOut() ? null : sortedSearches().map(toSearch);
      },
      async search(id) {
        const rec = searches.get(id);
        return rec && !signedOut() ? toSearch(rec) : null;
      },
      async companies(searchId, query) {
        const rec = searches.get(searchId);
        if (!rec || signedOut() || !synced(rec)) return null;
        const params = new URLSearchParams();
        if (query.verification) params.set('verification', query.verification);
        if (query.kind) params.set('kind', query.kind);
        if (query.q) params.set('q', query.q);
        if (query.offset) params.set('cursor', String(query.offset));
        const { nextCursor, ...page } = listCompanies(rec, params);
        return { ...page, nextOffset: nextCursor === null ? null : Number(nextCursor) };
      },
      async find({ q, limit = 8 }) {
        if (signedOut()) return null;
        const needle = q.trim().toLowerCase();
        if (!needle) return { hits: [], total: 0 };
        const hits = sortedSearches()
          .filter(synced)
          .flatMap((rec) => {
            const search = toSearch(rec);
            return companiesOf(rec, progress(rec))
              .filter((c) => [c.name, c.domain, ...c.emails.map((e) => e.address)].join(' ').toLowerCase().includes(needle))
              .map((company) => ({ search, company }));
          });
        return { hits: hits.slice(0, limit), total: hits.length };
      },
      async refresh() {},
      async status() {
        return localStatus();
      },
      onChange() {
        return () => undefined;
      },
    },
    notifications: {
      async getSettings() {
        return { enabled: storage.getItem('nvoke.mock.notifications') !== 'off', supported: true };
      },
      async setEnabled(enabled) {
        storage.setItem('nvoke.mock.notifications', enabled ? 'on' : 'off');
        return { enabled, supported: true };
      },
      markSeen() {},
      onOpenSearch() {
        return () => undefined;
      },
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
