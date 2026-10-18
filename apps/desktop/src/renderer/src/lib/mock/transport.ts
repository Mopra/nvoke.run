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
  isDecisionMaker,
  PLANS,
  SEARCH_LIMIT_MAX,
  CreateWebhookRequest,
  BuildSiteProfileRequest,
  DraftOpenersRequest,
  UpdateDropRequest,
  UpdateSearchRequest,
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
/** A shared inbox check settles this long after the switch, staggered per company. */
const INBOX_MS = 2500;
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
  /** Every run, as `Search.runs` lists them. */
  runs: RunRecord[];
  /** Companies held before the current run, and when that run was queued. */
  base: number;
  runAt: number;
  /** Plain words searches keep finding new companies after they end, while on. */
  ongoing?: boolean;
  /** Shared inboxes are checked too. Off by default, like the server: they stay hidden. */
  checkInboxes?: boolean;
  /** When the shared inbox switch went on after the search had run, so their checks settle from then. */
  inboxesAt?: number;
}

interface RunRecord {
  input: SearchInput;
  limit: number;
  foundBefore: number;
  createdAt: number;
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

  /** Plain words searches plan, mine directories and read team pages, so they take a few minutes. */
  function findDuration(total: number, kind: SearchInput['kind'] = 'web'): number {
    return kind === 'icp' ? clamp(total * 0.25, 30, 200) : clamp(total * 0.18, 5, 45);
  }

  /** Companies discovered after `t` seconds of running. */
  function foundAt(total: number, t: number, kind?: SearchInput['kind']): number {
    if (t <= 0) return 0;
    return Math.floor(clamp(t / findDuration(total, kind), 0, 1) * total);
  }

  /** The current run counts from `runAt` on top of the `base` companies earlier runs found. */
  function progress(rec: SearchRecord): Progress {
    const clock = rec.frozenAt === null ? now() : Math.min(now(), rec.frozenAt);
    const t = (clock - rec.runAt - QUEUE_MS) / 1000;
    const startedAt = rec.base > 0 || t >= 0 ? rec.createdAt + QUEUE_MS : null;
    const fresh = rec.total - rec.base;
    const kind = rec.input.kind;
    const found = rec.base + foundAt(fresh, t, kind);
    const crawled = rec.base + foundAt(fresh, (t - 2) / 1.2, kind);
    const verified = rec.base + foundAt(fresh, (t - 3.5) / 1.2, kind);
    const doneAfter = 3.5 + 1.2 * findDuration(fresh, kind);

    if (rec.terminal) {
      return { status: rec.terminal.status, found, crawled, verified, startedAt, finishedAt: rec.frozenAt };
    }
    if (t < 0) return { status: 'queued', found: rec.base, crawled: rec.base, verified: rec.base, startedAt, finishedAt: null };
    if (t >= doneAfter) {
      return {
        status: 'done',
        found: rec.total,
        crawled: rec.total,
        verified: rec.total,
        startedAt,
        finishedAt: rec.runAt + QUEUE_MS + doneAfter * 1000,
      };
    }
    return { status: 'running', found, crawled, verified, startedAt, finishedAt: null };
  }

  /** Each company is made from the input of the run that found it. */
  function seeds(rec: SearchRecord): MockCompanySeed[] {
    let list = seedCache.get(rec.id);
    if (!list) seedCache.set(rec.id, (list = []));
    for (let i = list.length; i < rec.total; i++) {
      const run = rec.runs.findLast((r) => r.foundBefore <= i);
      list.push(generateCompany(rec.id, run?.input ?? rec.input, i));
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
        ...(crawled ? emailsOf(rec, s, i, verified, stamp) : { emails: [], inboxesSkipped: 0, inboxesPending: 0 }),
        opener: openerOf(rec, i),
      });
    }
    return out;
  }

  /**
   * A crawled company's emails as the server lists them, with its shared
   * inbox counts. Shared inboxes are skipped unless the search checks them
   * (counted where no personal address is valid, like the server); switched
   * on later, each stays hidden until it settles a moment after the switch,
   * staggered like a queue draining.
   */
  function emailsOf(
    rec: SearchRecord,
    seed: MockCompanySeed,
    index: number,
    verified: boolean,
    stamp: string,
  ): Pick<Company, 'emails' | 'inboxesSkipped' | 'inboxesPending'> {
    const emails: Company['emails'] = [];
    let inboxes = 0;
    let pending = 0;
    // A valid personal address makes the inboxes unnecessary: the policy leaves them out either way.
    const personValid = seed.emails.some((e, k) => e.kind === 'personal' && verified && seed.verifications[k] === 'valid');
    seed.emails.forEach((e, k) => {
      const inbox = e.kind === 'generic' && !e.person;
      const settled = inbox && rec.inboxesAt !== undefined ? now() >= rec.inboxesAt + INBOX_MS + (index % 10) * 300 : verified;
      if (inbox && personValid) return;
      if (inbox && !rec.checkInboxes) inboxes += 1;
      else if (inbox && !settled) pending += 1;
      else emails.push({ ...e, verification: settled ? seed.verifications[k]! : null, checkedAt: settled ? stamp : null });
    });
    return { emails, inboxesSkipped: inboxes, inboxesPending: pending };
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

  /** What a plain words search says it is doing, from how far it got. Null for other kinds and once it ended. */
  function stageOf(rec: SearchRecord, p: Progress, people: number): { stage: string; stageNote: string } | null {
    if (rec.input.kind !== 'icp' || (p.status !== 'queued' && p.status !== 'running')) return null;
    const { countries } = rec.input.params;
    const share = p.found / Math.max(1, rec.total);
    if (p.status === 'queued' || p.found === 0) return { stage: 'plan', stageNote: 'Planning 14 searches from your description' };
    if (share < 0.3) return { stage: 'directories', stageNote: 'Reading agency directories and list pages' };
    if (share < 0.6) {
      const where = countries?.length ? `${countries.length} ${countries.length === 1 ? 'country' : 'countries'}` : '6 countries';
      return { stage: 'search', stageNote: `Searching the web in ${where}` };
    }
    if (p.crawled < rec.total * 0.92) return { stage: 'people', stageNote: `Reading team pages, ${people} people so far` };
    return { stage: 'verify', stageNote: 'Checking addresses with each mail server' };
  }

  function toSearch(rec: SearchRecord): Search {
    const p = progress(rec);
    const companies = companiesOf(rec, p);
    let emailsFound = 0;
    let emailsValid = 0;
    let people = 0;
    for (const c of companies) {
      emailsFound += c.emails.length;
      emailsValid += c.emails.filter((e) => e.verification === 'valid').length;
      people += c.emails.filter((e) => e.person).length;
    }
    const stage = stageOf(rec, p, people);
    const iso = (ms: number | null): string | null => (ms === null ? null : new Date(ms).toISOString());
    const search = {
      id: rec.id,
      kind: rec.input.kind,
      params: paramsOf(rec.input),
      limit: rec.limit,
      runs: rec.runs.map((r) => ({ params: paramsOf(r.input), limit: r.limit, foundBefore: r.foundBefore, createdAt: iso(r.createdAt)! })),
      status: p.status,
      error: rec.terminal?.error ?? null,
      companiesFound: p.found,
      companiesCrawled: p.crawled,
      emailsFound,
      emailsValid,
      createdAt: new Date(rec.createdAt).toISOString(),
      startedAt: iso(p.startedAt),
      finishedAt: iso(p.finishedAt),
      ...(rec.input.kind === 'icp' ? { stage: stage?.stage ?? null, stageNote: stage?.stageNote ?? null, ongoing: rec.ongoing ?? false } : {}),
      checkInboxes: rec.checkInboxes ?? false,
      inboxesSkipped: companies.reduce((n, c) => n + (c.inboxesSkipped ?? 0), 0),
      inboxesPending: companies.reduce((n, c) => n + (c.inboxesPending ?? 0), 0),
    } as Search;
    if (!rec.dropRun) return search;
    const { runs: _runs, ...rest } = search as Search & { runs?: unknown };
    return { ...rest, kind: 'drop', params: rec.dropRun } as Search;
  }

  /** The server fills in the launches default, so the mock does too. */
  function paramsOf(input: SearchInput): Search['params'] {
    return input.kind === 'launches' ? ({ days: 7, ...input.params } satisfies LaunchesParams) : input.params;
  }

  /** A list is as long as it is, like on the server: the limit only cuts it. */
  function settle(input: SearchInput): { input: SearchInput; limit: number } {
    if (input.kind !== 'domains') return { input, limit: clamp(input.limit ?? 100, 1, MAX_LIMIT) };
    const items = input.params.items.slice(0, clamp(input.limit ?? MAX_LIMIT, 1, MAX_LIMIT));
    return { input: { ...input, params: { ...input.params, items } }, limit: items.length };
  }

  /** How many companies a run finds: every domain, and most of what a source is asked for. */
  function yieldOf(id: string, input: SearchInput, limit: number): number {
    return input.kind === 'domains' ? Math.max(1, limit - Math.floor(limit / 9)) : sourceYield(id, limit);
  }

  /** POST /v1/searches/:id/more: another run on top of what the search holds. */
  function searchMore(rec: SearchRecord, body: unknown): BridgeResponse {
    const valid = validInput(body);
    if (!valid) return fail(400, 'invalid_request');
    if (rec.dropRun || valid.kind !== rec.input.kind) return fail(400, 'kind_mismatch');
    const p = progress(rec);
    if (p.status === 'queued' || p.status === 'running') return fail(409, 'search_running');
    const { input, limit } = settle(valid);
    const base = p.found;
    rec.input = input;
    rec.base = base;
    rec.runAt = now();
    rec.limit = base + limit;
    rec.total = base + yieldOf(`${rec.id}:${rec.runs.length}`, input, limit);
    rec.frozenAt = null;
    rec.terminal = null;
    rec.runs.push({ input, limit, foundBefore: base, createdAt: rec.runAt });
    return json(200, toSearch(rec));
  }

  function add(input: SearchInput, createdAt: number, extra: Partial<SearchRecord> = {}): SearchRecord {
    counter += 1;
    const id = `mock-${counter.toString().padStart(4, '0')}`;
    const settled = settle(input);
    input = settled.input;
    const limit = settled.limit;
    const rec: SearchRecord = {
      id,
      input,
      limit,
      createdAt,
      frozenAt: null,
      terminal: null,
      total: yieldOf(id, input, limit),
      runs: [{ input, limit, foundBefore: 0, createdAt }],
      base: 0,
      runAt: createdAt,
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
    // A local search that asked for shared inboxes: a clinic's front desk is often the only address.
    add({ kind: 'local', params: { niche: 'dentists', location: 'Austin' }, limit: 100 }, t0 - day - 3 * 60 * min, { checkInboxes: true });
    add(
      {
        kind: 'domains',
        params: { items: ['linear.app', 'vercel.com', 'Pleo', 'https://www.figma.com', 'Too Good To Go', 'raycast.com', 'Lunar'] },
      },
      t0 - day - 6 * 60 * min,
    );
    add({ kind: 'local', params: { niche: 'bakeries', location: 'Lisbon' }, limit: 80 }, t0 - 9000);
    add(
      {
        kind: 'icp',
        params: {
          description: 'Marketing agencies with 5 to 30 people that build websites for clients',
          product: 'Lead lists of named decision makers with verified emails',
          countries: ['gb', 'nl'],
        },
        limit: 300,
      },
      t0 - 2 * 60 * min,
      { ongoing: true },
    );
    add(
      {
        kind: 'icp',
        params: { description: 'B2B SaaS startups with 10 to 50 people hiring their first sales rep' },
        limit: 1000,
      },
      t0 - 4000,
      { ongoing: true },
    );
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
    if (b.kind === 'icp' && text(p['description'])) return b as unknown as SearchInput;
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
    const flag = (key: string): boolean => ['1', 'true'].includes(query.get(key) ?? '');
    const dm = flag('decisionMakers');
    const people = flag('people');
    const q = query.get('q')?.trim().toLowerCase() ?? '';
    const offset = Number(query.get('cursor') ?? '0') || 0;

    let list = companiesOf(rec, progress(rec));
    if (verification || kind || dm || people) {
      list = list
        .map((c) => ({
          ...c,
          emails: c.emails.filter(
            (e) =>
              (!verification || e.verification === verification) &&
              (!kind || e.kind === kind) &&
              (!dm || isDecisionMaker(e.person?.seniority ?? null)) &&
              (!people || e.person != null),
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
        return json(201, toSearch(add(input, now(), { checkInboxes: (body as { checkInboxes?: unknown }).checkInboxes === true })));
      }
    }

    const rec = searches.get(parts[2] ?? '');
    if (!rec) return fail(404, 'not_found');

    if (parts.length === 3 && method === 'GET') return json(200, toSearch(rec));
    if (parts.length === 3 && method === 'PATCH') {
      const req = UpdateSearchRequest.safeParse(body);
      if (!req.success) return fail(400, 'invalid_request');
      const { ongoing, checkInboxes } = req.data;
      if (ongoing !== undefined && (rec.input.kind !== 'icp' || rec.dropRun)) return fail(400, 'not_ongoing');
      if (ongoing !== undefined) rec.ongoing = ongoing;
      if (checkInboxes === true && !rec.checkInboxes) rec.inboxesAt = now();
      if (checkInboxes !== undefined) rec.checkInboxes = checkInboxes;
      return json(200, toSearch(rec));
    }
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
    if (parts[3] === 'more' && method === 'POST') return searchMore(rec, body);
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
   * GET, POST, PATCH and DELETE /v1/site-profile. Any site works except one under
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
    if (method === 'DELETE') {
      if (!current) return fail(404, 'not_found');
      storage.setItem(SITE_PROFILE_KEY, '');
      return json(204, null);
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
        if (query.decisionMakers) params.set('decisionMakers', 'true');
        if (query.people) params.set('people', 'true');
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
