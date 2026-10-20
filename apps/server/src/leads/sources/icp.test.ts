import { describe, expect, it } from 'vitest';
import type { IcpSearchParams, LocalSearchParams } from '@nvoke/shared';
import { AiError, type Ai, type StructuredRequest } from '../../ai/client.js';
import { fakeFetch, silentLog } from '../../testing/fakes.js';
import type { IndexAsk, IndexCandidate } from '../company-index.js';
import { RateLimiter } from '../limits.js';
import type { Sql } from 'postgres';
import { toPlan, type ClaudePlan } from '../planner.js';
import type { CachedWebPage } from '../web-cache.js';
import { brandOf, icpAdapter, interleave, spreadByCountry } from './icp.js';
import { PermanentError, type FoundCompany, type SourceAdapter } from './types.js';
import type { BraveClient, BravePageRequest } from './web.js';

const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };

const PLAN: ClaudePlan = {
  summary: 'Outbound agencies',
  fit: ['Runs outbound for clients'],
  disqualifiers: ['A job board'],
  countries: ['us', 'de'],
  core: [
    { q: 'cold email agency', country: 'us' },
    { q: 'appointment setting agency', country: 'us' },
    { q: 'Kaltakquise Agentur', country: 'de' },
  ],
  directories: [{ q: 'top cold email agencies', country: 'us' }],
  adjacent: [{ q: 'sdr outsourcing', country: 'us' }],
  wider: [{ q: 'cold email agency', country: 'ie' }],
  local: [],
};

/** Plans with PLAN and scores every domain with "bad" in it 10, the rest 80. `fitError` makes every fit call fail. */
function fakeAi(plan: ClaudePlan = PLAN, fitError?: Error): Ai & { tasks: string[] } {
  const tasks: string[] = [];
  return {
    tasks,
    ready: async () => true,
    async structured(req: StructuredRequest<never>) {
      tasks.push(req.task);
      if (req.task === 'plan') return { data: plan as never, model: 'sonnet', usage, costUsd: 0.02 };
      if (fitError) throw fitError;
      const domains = [...req.prompt.matchAll(/^\d+\. \[([^\]]+)\]/gm)].map((m) => m[1]!);
      const scores = domains.map((domain) => ({ domain, fit: domain.includes('bad') ? 10 : 80, reason: `fits: ${domain}` }));
      return { data: { scores } as never, model: 'haiku', usage, costUsd: 0.001 };
    },
  } as Ai & { tasks: string[] };
}

const result = (domain: string, extra: Partial<FoundCompany> = {}): FoundCompany => ({
  name: domain,
  website: `https://${domain}`,
  source: 'brave',
  sourceRef: `https://${domain}/`,
  ...extra,
});

/** Brave pages by query: a list of domains per query, more pages when `more`. */
function fakeBrave(pages: Record<string, { companies: FoundCompany[]; more?: boolean }>): BraveClient & { asked: BravePageRequest[] } {
  const asked: BravePageRequest[] = [];
  return {
    asked,
    configured: true,
    async page(req, ctx): Promise<CachedWebPage> {
      asked.push(req);
      ctx.onUsage?.('request');
      const page = pages[`${req.q}|${req.page}`];
      return { companies: page?.companies ?? [], more: page?.more ?? false };
    },
  };
}

const LIST_HTML = `<html><head><title>Top 3 cold email agencies</title></head><body><main><ol>
<li><a href="https://listed-one.com">Listed One</a> books meetings.</li>
<li><a href="https://listed-two.io">Listed Two</a> runs cold email.</li>
<li><a href="https://bad-listed.com">Bad Listed</a> a job board.</li>
</ol></main></body></html>`;

function listFetch() {
  return fakeFetch({
    'https://blog.example.com/robots.txt': { status: 404, body: '' },
    'https://blog.example.com/top-3': { body: LIST_HTML },
  });
}

/** A Sql that answers the stored plan and the companies the search holds, and records every query. */
function fakeSql(rows: { plan: unknown; domains?: string[] }): Sql & { queries: { text: string; values: unknown[] }[] } {
  const queries: { text: string; values: unknown[] }[] = [];
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?');
    queries.push({ text, values });
    if (/select plan from searches/.test(text)) return [{ plan: rows.plan }];
    if (/select domain from companies/.test(text)) return (rows.domains ?? []).map((domain) => ({ domain }));
    return [];
  }) as unknown as Sql & { queries: typeof queries };
  Object.assign(sql, { queries, json: (v: unknown) => v });
  return sql;
}

async function run(
  adapter: SourceAdapter<IcpSearchParams>,
  limit: number,
  opts: { abortAfter?: number; params?: IcpSearchParams; searchId?: string; onUsage?: (event: 'request' | 'cache_hit') => void } = {},
) {
  const stages: [string, string][] = [];
  const out: FoundCompany[] = [];
  const controller = new AbortController();
  const ctx = {
    limit,
    signal: controller.signal,
    log: silentLog,
    userId: 'user_1',
    searchId: opts.searchId,
    onUsage: opts.onUsage,
    onStage: async (stage: string, note: string) => void stages.push([stage, note]),
  };
  for await (const c of adapter.find(opts.params ?? { description: 'Outbound agencies' }, ctx)) {
    out.push(c);
    if (out.length === opts.abortAfter) controller.abort();
  }
  return { out, stages };
}

describe('interleave and spreadByCountry', () => {
  it('takes turns', () => {
    expect(interleave([[1, 2, 3], [4], [5, 6]])).toEqual([1, 4, 5, 2, 6, 3]);
    const spread = spreadByCountry([
      { q: 'a', country: 'us' },
      { q: 'b', country: 'us' },
      { q: 'c', country: 'de' },
    ]);
    expect(spread.map((q) => q.q)).toEqual(['a', 'c', 'b']);
  });
});

describe('icp adapter', () => {
  it('needs Claude and Brave', async () => {
    await expect(run(icpAdapter({ brave: fakeBrave({}) }), 10)).rejects.toThrow(PermanentError);
    await expect(run(icpAdapter({ brave: { ...fakeBrave({}), configured: false }, ai: fakeAi() }), 10)).rejects.toThrow(PermanentError);
  });

  it('runs the core tier interleaved, reads list pages, drops what does not fit and stops at the limit', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('alpha.com'), result('bad-shop.com'), result('www.linkedin.com')] },
      'top cold email agencies|0': {
        companies: [result('blog.example.com', { sourceRef: 'https://blog.example.com/top-3', title: 'Top 3 cold email agencies' })],
      },
      'appointment setting agency|0': { companies: [result('beta.com'), result('alpha.com')] },
      'Kaltakquise Agentur|0': { companies: [result('gamma.de')] },
    });
    const ai = fakeAi();
    const { out, stages } = await run(icpAdapter({ brave, ai, listFetch: listFetch(), crawl: { limiter: new RateLimiter(0) } }), 4);
    expect(ai.tasks[0]).toBe('plan');
    // Core and directory queries take turns, and the list page's companies come in for free.
    expect(brave.asked.map((r) => r.q).slice(0, 2)).toEqual(['cold email agency', 'top cold email agencies']);
    const domains = out.map((c) => new URL(c.website).hostname);
    expect(domains).toHaveLength(4);
    expect(domains).not.toContain('bad-shop.com');
    expect(domains).not.toContain('bad-listed.com');
    expect(domains).not.toContain('www.linkedin.com');
    expect(out.find((c) => c.website === 'https://listed-one.com')).toMatchObject({ source: 'list_page', sourceRef: 'https://blog.example.com/top-3', fit: 80 });
    expect(out[0]).toMatchObject({ fit: 80, fitReason: 'fits: alpha.com' });
    expect(stages[1]).toEqual(['core', 'Searching 4 queries in 2 countries']);
    expect(stages.some(([s, n]) => s === 'lists' && n.includes('Reading 1 list page'))).toBe(true);
    expect(stages.at(-1)).toEqual(['done', 'Found 4 fitting candidates, enough for this search']);
    // Enough after tier 1: the adjacent and wider tiers never ran.
    expect(brave.asked.some((r) => r.q === 'sdr outsourcing')).toBe(false);
  });

  it('widens tier by tier, reads deeper pages of queries that paid off and says when it runs out', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('a1.com'), result('a2.com'), result('a4.com')], more: true },
      'cold email agency|1': { companies: [result('a3.com')], more: false },
      'appointment setting agency|0': { companies: [result('bad1.com'), result('bad2.com')], more: true },
      'sdr outsourcing|0': { companies: [result('b1.com')] },
      'cold email agency Ireland|0': { companies: [result('c1.ie')] },
    });
    const { out, stages } = await run(icpAdapter({ brave, ai: fakeAi(), listFetch: listFetch(), crawl: { limiter: new RateLimiter(0) } }), 50);
    expect(out.map((c) => c.website)).toEqual(['https://a1.com', 'https://a2.com', 'https://a4.com', 'https://b1.com', 'https://c1.ie', 'https://a3.com']);
    expect(stages.map(([s]) => s)).toEqual(expect.arrayContaining(['adjacent', 'widen_geo', 'deeper', 'exhausted']));
    expect(stages.find(([s]) => s === 'widen_geo')?.[1]).toBe('Found 4 so far. Looking in 1 more country');
    // The query whose results did not fit gets no second page.
    expect(brave.asked.some((r) => r.q === 'appointment setting agency' && r.page === 1)).toBe(false);
    expect(stages.at(-1)).toEqual(['exhausted', 'Every planned search is done: found 6 fitting candidates, short of 50. Describe your customer more broadly or add countries to find more.']);
  });

  it('reads no deeper page of a query whose page kept fewer than three', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('a1.com'), result('a2.com')], more: true },
      'cold email agency|1': { companies: [result('a3.com')] },
    });
    await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), listFetch: listFetch(), crawl: { limiter: new RateLimiter(0) } }), 50);
    expect(brave.asked.some((r) => r.page === 1)).toBe(false);
  });

  it('runs local pairs through the local adapter and scores them too', async () => {
    const asked: LocalSearchParams[] = [];
    const local: SourceAdapter<LocalSearchParams> = {
      kind: 'local',
      async *find(params) {
        asked.push(params);
        yield { name: 'Smile', website: 'https://smile.dk', source: 'osm', category: 'dentist', location: 'Aarhus' };
        yield { name: 'Bad Teeth', website: 'https://badteeth.dk', source: 'osm' };
      },
    };
    const plan: ClaudePlan = { ...PLAN, core: [], directories: [], adjacent: [], wider: [], local: [{ niche: 'tandlæge', location: 'Aarhus' }] };
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave: fakeBrave({}), ai: fakeAi(plan), local }), 10, {
      params: { description: 'Dentists in Aarhus' },
    });
    expect(asked).toEqual([{ niche: 'tandlæge', location: 'Aarhus' }]);
    expect(out.map((c) => c.website)).toEqual(['https://smile.dk']);
    expect(stages[1]).toEqual(['core', 'Searching 1 place on the map']);
  });

  it('gives up after a run of failed queries so the job retries', async () => {
    const brave: BraveClient = {
      configured: true,
      page: async () => {
        throw new TypeError('fetch failed');
      },
    };
    await expect(run(icpAdapter({ readHeads: false, brave, ai: fakeAi() }), 10)).rejects.toThrow('fetch failed');
  });
});

describe('icp adapter limits', () => {
  const local = (fail?: string): SourceAdapter<LocalSearchParams> => ({
    kind: 'local',
    async *find(params) {
      if (params.location === fail) throw new PermanentError(`location not found: ${params.location}`, 'location_not_found');
      yield { name: `Clinic ${params.location}`, website: `https://clinic-${params.location.toLowerCase()}.dk`, source: 'osm' };
    },
  });

  it('stops paid searches at the budget, says so, and still runs the free local pairs', async () => {
    const brave = fakeBrave({});
    const plan: ClaudePlan = { ...PLAN, local: [{ niche: 'dentist', location: 'Aarhus' }, { niche: 'dentist', location: 'Odense' }] };
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(plan), local: local(), braveBudget: 2 }), 50);
    expect(brave.asked).toHaveLength(2);
    expect(out.map((c) => c.website)).toEqual(['https://clinic-aarhus.dk', 'https://clinic-odense.dk']);
    expect(stages.find(([s]) => s === 'budget')?.[1]).toContain("Used this search's 2 web searches");
    // No paid tier starts once the budget is spent.
    expect(stages.map(([s]) => s)).not.toContain('adjacent');
    expect(stages.at(-1)?.[1]).toMatch(/^This search used its 2 web searches: found 2 fitting candidates, short of 50\./);
  });

  it('counts a page against the budget once, however many requests its provider billed for it', async () => {
    // Serper bills two requests for a page of 20 results.
    const asked: BravePageRequest[] = [];
    const brave: BraveClient = {
      configured: true,
      async page(req, ctx): Promise<CachedWebPage> {
        asked.push(req);
        ctx.onUsage?.('request');
        ctx.onUsage?.('request');
        return { companies: [], more: false };
      },
    };
    const events: string[] = [];
    const { stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), braveBudget: 3 }), 50, { onUsage: (e) => void events.push(e) });
    expect(asked).toHaveLength(3);
    // Every billed request still reaches the search's source_requests.
    expect(events).toEqual(Array(6).fill('request'));
    expect(stages.find(([s]) => s === 'budget')?.[1]).toContain("Used this search's 3 web searches");
  });

  it('holds a stored plan to the smaller Brave budget an ongoing round reserved', async () => {
    const brave = fakeBrave({});
    const stored = { ...toPlan(PLAN, { description: 'Outbound agencies' }), braveBudget: 1 };
    const sql = fakeSql({ plan: stored });
    const { stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), sql, braveBudget: 120 }), 50, { searchId: 'search_1' });
    expect(brave.asked).toHaveLength(1);
    expect(stages.find(([s]) => s === 'budget')?.[1]).toContain("Used this search's 1 web searches");
  });

  it('never scores a site again that the search holds or an earlier round turned down, and saves what the run learned', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('held.com'), result('old-bad.com'), result('new-bad.com'), result('fresh.com')] },
    });
    const stored = { ...toPlan(PLAN, { description: 'Outbound agencies' }), rejected: ['old-bad.com'], ran: ['earlier query|us'], yields: { 'earlier query|us': { pages: 2, kept: 5 }, 'long gone|us': { pages: 1, kept: 0 } } };
    const sql = fakeSql({ plan: stored, domains: ['www.held.com'] });
    const ai = fakeAi();
    const scored: string[] = [];
    const structured = ai.structured.bind(ai);
    ai.structured = (async (req: StructuredRequest<never>) => {
      if (req.task === 'fit') scored.push(...[...req.prompt.matchAll(/^\d+\. \[([^\]]+)\]/gm)].map((m) => m[1]!));
      return structured(req);
    }) as Ai['structured'];
    const { out } = await run(icpAdapter({ readHeads: false, brave, ai, sql }), 50, { searchId: 'search_1' });
    expect(scored).toEqual(['new-bad.com', 'fresh.com']);
    expect(out.map((c) => c.website)).toEqual(['https://fresh.com']);
    const saved = sql.queries.find((q) => /update searches set plan = plan \|\|/.test(q.text));
    const learned = saved?.values[0] as { rejected: string[]; yields: Record<string, { pages: number; kept: number }> };
    expect(learned.rejected).toEqual(['old-bad.com', 'new-bad.com']);
    expect(learned.yields['cold email agency|us']).toEqual({ pages: 1, kept: 1 });
    expect(learned.yields['earlier query|us']).toEqual({ pages: 2, kept: 5 });
    // A query that fell out of the capped ran list leaves the record too.
    expect(learned.yields['long gone|us']).toBeUndefined();
  });

  it('skips a place the map cannot find instead of failing the search', async () => {
    const plan: ClaudePlan = { ...PLAN, core: [], directories: [], adjacent: [], wider: [], local: [{ niche: 'dentist', location: 'Nowhereville' }, { niche: 'dentist', location: 'Aarhus' }] };
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave: fakeBrave({}), ai: fakeAi(plan), local: local('Nowhereville') }), 10);
    expect(out.map((c) => c.website)).toEqual(['https://clinic-aarhus.dk']);
    expect(stages.some(([, n]) => n.includes('Could not find Nowhereville on the map, skipping it'))).toBe(true);
  });

  it('stops at once and writes nothing after a cancel', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('a1.com'), result('a2.com')] },
      'sdr outsourcing|0': { companies: [result('b1.com')] },
    });
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi() }), 50, { abortAfter: 1 });
    expect(out).toHaveLength(1);
    expect(stages.map(([s]) => s)).not.toContain('exhausted');
    expect(stages.map(([s]) => s)).not.toContain('adjacent');
    expect(brave.asked.some((r) => r.q === 'sdr outsourcing')).toBe(false);
  });

  it('keeps web results unscored and leaves list page links out when Claude cannot be asked', async () => {
    const brave = fakeBrave({
      'cold email agency|0': { companies: [result('alpha.com')] },
      'top cold email agencies|0': {
        companies: [result('blog.example.com', { sourceRef: 'https://blog.example.com/top-3', title: 'Top 3 cold email agencies' })],
      },
    });
    const ai = fakeAi(PLAN, new AiError('budget_exceeded', 'spent'));
    const { out, stages } = await run(icpAdapter({ brave, ai, listFetch: listFetch(), crawl: { limiter: new RateLimiter(0) } }), 50);
    expect(out.map((c) => c.source)).not.toContain('list_page');
    expect(out[0]).toMatchObject({ website: 'https://alpha.com' });
    expect(out[0]!.fit).toBeUndefined();
    expect(stages.some(([, n]) => n.includes('Claude is out of reach'))).toBe(true);
  });
});

describe('icp adapter fit', () => {
  it('scores from the homepage and keeps one company across country domains', async () => {
    const prompts: string[] = [];
    const ai = fakeAi();
    const spy: Ai = {
      ready: ai.ready,
      structured: (req) => {
        prompts.push(req.prompt);
        return ai.structured(req);
      },
    };
    const brave = fakeBrave({ 'cold email agency|0': { companies: [result('alpha.com'), result('alpha.de'), result('beta.io')] } });
    const listFetch = fakeFetch({
      'https://alpha.com/robots.txt': { status: 404, body: '' },
      'https://alpha.com/': { body: '<html><head><title>Alpha | Cold email agency</title><meta name="description" content="We book meetings"></head></html>' },
    });
    const { out } = await run(icpAdapter({ brave, ai: spy, listFetch, crawl: { limiter: new RateLimiter(0) } }), 50);
    expect(out.map((c) => c.website)).toEqual(['https://alpha.com', 'https://beta.io']);
    expect(prompts.some((p) => p.includes('homepage: Alpha | Cold email agency | We book meetings'))).toBe(true);
    expect(prompts.some((p) => /\[beta\.io\][^\n]*\n(\s+.*\n)*\s+homepage: could not be read/.test(p))).toBe(true);
  });

  it('tells brands apart only on labels long enough', () => {
    expect(brandOf('acme.co.uk')).toBe('acme');
    expect(brandOf('ab.de')).toBeNull();
  });
});

describe('icp adapter: job posts and paginated lists', () => {
  it('maps a job post for a sales role to the company behind it, once per board', async () => {
    const hiringPlan: ClaudePlan = { ...PLAN, core: [{ q: 'sdr jobs', country: 'us' }], directories: [], adjacent: [], wider: [], hiringRoles: [] };
    const posting = (id: string) =>
      result('jobs.lever.co', { sourceRef: `https://jobs.lever.co/belkins/${id}`, title: 'Belkins - Sales Development Representative' });
    const brave = fakeBrave({
      'sdr jobs|0': { companies: [posting('a1'), posting('a2'), result('jobs.lever.co', { sourceRef: 'https://jobs.lever.co/acme/b1', title: 'Acme - Backend Engineer' })] },
    });
    const listFetch = fakeFetch({
      'https://jobs.lever.co/robots.txt': { body: 'User-agent: *\nAllow: /' },
      'https://jobs.lever.co/belkins': { body: '<a href="https://belkins.io/">Belkins Home Page</a>' },
    });
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(hiringPlan), listFetch, crawl: { limiter: new RateLimiter(0) } }), 10, {
      params: { description: 'Agencies' },
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      name: 'Belkins',
      website: 'https://belkins.io',
      source: 'hiring',
      sourceRef: 'https://jobs.lever.co/belkins/a1',
      title: 'Hiring: Sales Development Representative',
      fit: 80,
    });
    expect(stages.some(([s, n]) => s === 'hiring' && n.includes('Reading 1 job post'))).toBe(true);
    // The other role is no signal: its board is never read.
    expect(listFetch.calls.some((c) => c.url.includes('/acme'))).toBe(false);
  });

  it('runs the plan job post queries after the wider geography, while the search is short', async () => {
    const brave = fakeBrave({});
    const { stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi({ ...PLAN, hiringRoles: ['founding account executive'] }), listFetch: listFetch() }), 10, {
      params: { description: 'Founders of B2B startups' },
    });
    const asked = brave.asked.filter((r) => r.page === 0).map((r) => r.q);
    const job = '"founding account executive" (site:jobs.lever.co OR site:job-boards.greenhouse.io OR site:boards.greenhouse.io OR site:jobs.ashbyhq.com OR site:apply.workable.com)';
    expect(asked.indexOf(job)).toBeGreaterThan(asked.indexOf('cold email agency'));
    expect(asked.indexOf(job)).toBeGreaterThan(asked.indexOf('sdr outsourcing'));
    expect(stages.some(([s, n]) => s === 'hiring' && n === 'Looking for companies hiring salespeople')).toBe(true);
  });

  it('admits a company whose own partners page it mines, and the partners it names', async () => {
    const listFetch = fakeFetch({
      'https://acme-tool.com/robots.txt': { status: 404, body: '' },
      'https://acme-tool.com/partners': { body: '<html><body><main><a href="https://partner-one.com">Partner One</a></main></body></html>' },
    });
    const brave = fakeBrave({
      'nothing here|0': { companies: [result('acme-tool.com', { sourceRef: 'https://acme-tool.com/partners', title: 'Acme Tool partners' })] },
    });
    const plan: ClaudePlan = { ...PLAN, core: [{ q: 'nothing here', country: 'us' }], directories: [], adjacent: [], wider: [] };
    const { out } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(plan), listFetch, crawl: { limiter: new RateLimiter(0) } }), 10, {
      params: { description: 'Agencies' },
    });
    expect(out.map((c) => c.website).sort()).toEqual(['https://acme-tool.com', 'https://partner-one.com']);
  });

  it('follows a plain next page of a list that named companies', async () => {
    const page = (n: number, links: string) =>
      `<html><head><title>Top 20 cold email agencies</title></head><body><main><ol>${links}</ol>${n < 3 ? `<a href="/top-20?page=${n + 1}">Next</a>` : ''}</main></body></html>`;
    const listFetch = fakeFetch({
      'https://blog.example.com/robots.txt': { status: 404, body: '' },
      'https://blog.example.com/top-20': { body: page(1, '<li><a href="https://one.com">One</a></li>') },
      'https://blog.example.com/top-20?page=2': { body: page(2, '<li><a href="https://two.com">Two</a></li>') },
      'https://blog.example.com/top-20?page=3': { body: page(3, '<li><a href="https://three.com">Three</a></li>') },
    });
    const brave = fakeBrave({
      'top cold email agencies|0': { companies: [result('blog.example.com', { sourceRef: 'https://blog.example.com/top-20', title: 'Top 20 cold email agencies' })] },
    });
    const plan: ClaudePlan = { ...PLAN, core: [{ q: 'nothing here', country: 'us' }], adjacent: [], wider: [] };
    const { out } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(plan), listFetch, crawl: { limiter: new RateLimiter(0) } }), 10, {
      params: { description: 'Agencies' },
    });
    expect(out.map((c) => c.website)).toEqual(['https://one.com', 'https://two.com', 'https://three.com']);
  });
});

describe('icp adapter company index', () => {
  const indexed = (domain: string, head?: { title: string; description: string }): IndexCandidate => ({
    domain,
    name: domain,
    website: `https://${domain}`,
    snippet: `About ${domain}`,
    head,
    rank: 1,
    from: head ? 'pages' : 'feed',
  });

  it('asks the index first, scores its candidates from the kept homepage and pays Brave nothing when they fill the search', async () => {
    const asks: IndexAsk[] = [];
    const index = async (ask: IndexAsk) => {
      asks.push(ask);
      return [indexed('kept-one.com', { title: 'Kept One | Cold email agency', description: 'We book meetings' }), indexed('bad-kept.com', { title: 'Bad', description: '' }), indexed('kept-two.io', { title: 'Kept Two', description: 'Outbound' })];
    };
    const prompts: string[] = [];
    const ai = fakeAi();
    const spy: Ai = { ready: ai.ready, structured: (req) => (prompts.push(req.prompt), ai.structured(req)) };
    const brave = fakeBrave({ 'cold email agency|0': { companies: [result('alpha.com')] } });
    const listFetch = fakeFetch({});
    const { out, stages } = await run(icpAdapter({ brave, ai: spy, index, listFetch, crawl: { limiter: new RateLimiter(0) } }), 2);
    expect(out.map((c) => c.website)).toEqual(['https://kept-one.com', 'https://kept-two.io']);
    expect(out[0]).toMatchObject({ source: 'index', sourceRef: 'kept-one.com', fit: 80 });
    expect(asks[0]!.limit).toBe(6);
    // One fit call with the homepage already in it, and no page read for it.
    expect(prompts.filter((p) => p.includes('<candidates>'))).toHaveLength(1);
    expect(prompts.some((p) => p.includes('homepage: Kept One | Cold email agency | We book meetings'))).toBe(true);
    expect(listFetch.calls).toHaveLength(0);
    expect(brave.asked).toHaveLength(0);
    expect(stages.some(([s, n]) => s === 'index' && n === 'Checking 3 companies nvoke already knows')).toBe(true);
  });

  it('leaves out what the search holds or turned down and pays Brave only for the gap', async () => {
    const asks: IndexAsk[] = [];
    const index = async (ask: IndexAsk) => {
      asks.push(ask);
      return [indexed('kept-one.com', { title: 'Kept One', description: '' }), indexed('held.com', { title: 'Held', description: '' })];
    };
    const sql = fakeSql({ plan: { ...toPlan(PLAN, { description: 'Outbound agencies' }), rejected: ['nope.com'] }, domains: ['held.com'] });
    const brave = fakeBrave({ 'cold email agency|0': { companies: [result('alpha.com'), result('kept-one.com')] } });
    const { out } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), sql, index }), 2, { searchId: 'search_1' });
    expect([...asks[0]!.exclude!]).toEqual(expect.arrayContaining(['held.com', 'nope.com']));
    expect(out.map((c) => c.website)).toEqual(['https://kept-one.com', 'https://alpha.com']);
    // The index left one short, so tier 1 ran; its gap closed there, so no wider tier did.
    expect(brave.asked[0]!.q).toBe('cold email agency');
    expect(brave.asked.some((r) => r.q === 'sdr outsourcing')).toBe(false);
  });

  it('reads the homepage of a launch the crawl never kept, and goes on with web search when the index fails', async () => {
    const listFetch = fakeFetch({
      'https://launch.com/robots.txt': { status: 404, body: '' },
      'https://launch.com/': { body: '<html><head><title>Launch</title></head></html>' },
    });
    const { out } = await run(icpAdapter({ brave: fakeBrave({}), ai: fakeAi(), index: async () => [indexed('launch.com')], listFetch, crawl: { limiter: new RateLimiter(0) } }), 1);
    expect(out.map((c) => c.website)).toEqual(['https://launch.com']);
    expect(listFetch.calls.some((c) => c.url === 'https://launch.com/')).toBe(true);

    const brave = fakeBrave({ 'cold email agency|0': { companies: [result('alpha.com')] } });
    const failing = async (): Promise<IndexCandidate[]> => {
      throw new Error('index down');
    };
    const after = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), index: failing }), 1);
    expect(after.out.map((c) => c.website)).toEqual(['https://alpha.com']);
  });
});
