import { describe, expect, it } from 'vitest';
import type { IcpSearchParams, LocalSearchParams } from '@nvoke/shared';
import { AiError, type Ai, type StructuredRequest } from '../../ai/client.js';
import { fakeFetch, silentLog } from '../../testing/fakes.js';
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

async function run(
  adapter: SourceAdapter<IcpSearchParams>,
  limit: number,
  opts: { abortAfter?: number; params?: IcpSearchParams; searchId?: string } = {},
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
      'cold email agency|0': { companies: [result('a1.com'), result('a2.com')], more: true },
      'cold email agency|1': { companies: [result('a3.com')], more: false },
      'appointment setting agency|0': { companies: [result('bad1.com'), result('bad2.com')], more: true },
      'sdr outsourcing|0': { companies: [result('b1.com')] },
      'cold email agency Ireland|0': { companies: [result('c1.ie')] },
    });
    const { out, stages } = await run(icpAdapter({ brave, ai: fakeAi(), listFetch: listFetch(), crawl: { limiter: new RateLimiter(0) } }), 50);
    expect(out.map((c) => c.website)).toEqual(['https://a1.com', 'https://a2.com', 'https://b1.com', 'https://c1.ie', 'https://a3.com']);
    expect(stages.map(([s]) => s)).toEqual(expect.arrayContaining(['adjacent', 'widen_geo', 'deeper', 'exhausted']));
    expect(stages.find(([s]) => s === 'widen_geo')?.[1]).toBe('Found 3 so far. Looking in 1 more country');
    // The query whose results did not fit gets no second page.
    expect(brave.asked.some((r) => r.q === 'appointment setting agency' && r.page === 1)).toBe(false);
    expect(stages.at(-1)).toEqual(['exhausted', 'Every planned search is done: found 5 fitting candidates, short of 50. Describe your customer more broadly or add countries to find more.']);
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
    const { out, stages } = await run(icpAdapter({ readHeads: false, brave: fakeBrave({}), ai: fakeAi(plan), local }), 10);
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

  it('holds a stored plan to the smaller Brave budget an ongoing round reserved', async () => {
    const brave = fakeBrave({});
    const stored = { ...toPlan(PLAN, { description: 'Outbound agencies' }), braveBudget: 1 };
    const sql = (async () => [{ plan: stored }]) as unknown as Sql;
    const { stages } = await run(icpAdapter({ readHeads: false, brave, ai: fakeAi(), sql, braveBudget: 120 }), 50, { searchId: 'search_1' });
    expect(brave.asked).toHaveLength(1);
    expect(stages.find(([s]) => s === 'budget')?.[1]).toContain("Used this search's 1 web searches");
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
