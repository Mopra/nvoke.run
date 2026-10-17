import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { StructuredRequest } from '../ai/client.js';
import { AiError, type Ai } from '../ai/client.js';
import type { SitePage } from '../leads/page-text.js';
import { createTestDb, type TestDb } from '../testing/db.js';
import { silentLog } from '../testing/fakes.js';
import type { Job } from '../worker/queue.js';
import { checkOpener, normalizeForMatch, onOpenerGaveUp, openerPrompt, queueOpeners, runOpener, type ClaudeOpeners } from './openers.js';

const about: SitePage = {
  url: 'https://acme.dk/om-os',
  title: 'Om Acme Tandklinik',
  description: 'Tandlæger i Aarhus siden 1998',
  text: 'Vi har behandlet familier i Aarhus siden 1998.\nVores klinik har tre behandlingsrum og åbent lørdag.',
};

describe('checkOpener', () => {
  const answer = (over: Partial<ClaudeOpeners['openers'][number]> = {}) => ({
    company: 'c1',
    line: 'I saw your clinic is open on Saturdays, which few in Aarhus are.',
    quote: 'Vores klinik har tre behandlingsrum og åbent lørdag.',
    sourceUrl: 'https://acme.dk/om-os',
    ...over,
  });

  it('keeps a line whose quote is on the page it names', () => {
    expect(checkOpener(answer(), [about])).toEqual({
      status: 'done',
      line: 'I saw your clinic is open on Saturdays, which few in Aarhus are.',
      quote: 'Vores klinik har tre behandlingsrum og åbent lørdag.',
      sourceUrl: 'https://acme.dk/om-os',
    });
  });

  it('matches quotes across case, spacing and typographic quotes, and on the title and description', () => {
    expect(checkOpener(answer({ quote: '  VI HAR behandlet   familier i Aarhus ' }), [about]).status).toBe('done');
    expect(checkOpener(answer({ quote: 'Tandlæger i Aarhus siden 1998' }), [about]).status).toBe('done');
  });

  it('drops an invented quote, an unknown page and a missing answer', () => {
    expect(checkOpener(answer({ quote: 'Vi har 40 ansatte i hele Danmark.' }), [about])).toEqual({ status: 'none' });
    expect(checkOpener(answer({ sourceUrl: 'https://acme.dk/' }), [about])).toEqual({ status: 'none' });
    expect(checkOpener(answer({ line: null }), [about])).toEqual({ status: 'none' });
    expect(checkOpener(undefined, [about])).toEqual({ status: 'none' });
    expect(checkOpener(answer({ quote: 'Aarhus' }), [about])).toEqual({ status: 'none' });
  });

  it('drops merge tags and placeholders, and over long lines', () => {
    for (const line of ['Hi {{first_name}}, nice clinic.', 'Hi [Name], nice clinic.', 'Dear %FIRSTNAME%', 'Hello first name, open Saturdays.']) {
      expect(checkOpener(answer({ line }), [about]).status, line).toBe('none');
    }
    expect(checkOpener(answer({ line: 'x'.repeat(301) }), [about]).status).toBe('none');
  });

  it('turns dashes used as punctuation into commas', () => {
    const dash = String.fromCharCode(0x2014);
    const res = checkOpener(answer({ line: `Open on Saturdays ${dash} rare in Aarhus.` }), [about]);
    expect(res).toMatchObject({ status: 'done', line: 'Open on Saturdays, rare in Aarhus.' });
  });

  it('normalizes for matching', () => {
    expect(normalizeForMatch(`  “Open”  Saturdays’ `)).toBe(`"open" saturdays'`);
  });
});

describe('openerPrompt', () => {
  it('names the sender, then each company with its pages', () => {
    const prompt = openerPrompt(
      { name: 'Smilestudio', summary: 'Dental marketing.', offer: 'Booking sites for clinics', audience: 'Dental clinics', proofPoints: ['120 clinics'], voice: [], language: 'en', country: null },
      [{ key: 'c1', name: 'Acme "Tand"', domain: 'acme.dk', category: 'dentist', location: 'Aarhus', pages: [about] }],
    );
    expect(prompt).toContain('Offer: Booking sites for clinics');
    expect(prompt).toContain('<company key="c1" name="Acme  Tand " domain="acme.dk" category="dentist" location="Aarhus">');
    expect(prompt).toContain('<page url="https://acme.dk/om-os">');
    expect(openerPrompt(null, [])).toContain('Write about the company only');
  });
});

describe('runOpener', () => {
  let db: TestDb;
  let searchId: string;
  let calls: StructuredRequest<never>[];
  let reply: ClaudeOpeners | Error;

  const ai: Ai = {
    ready: async () => true,
    async structured(req) {
      calls.push(req as StructuredRequest<never>);
      if (reply instanceof Error) throw reply;
      return { data: req.schema.parse(reply), model: 'fake', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, costUsd: 0 };
    },
  };

  beforeAll(async () => {
    db = await createTestDb();
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await db.sql`truncate accounts, jobs, domains cascade`;
    calls = [];
    await db.sql`insert into accounts (clerk_user_id) values ('alice')`;
    const [s] = await db.sql<{ id: string }[]>`
      insert into searches (clerk_user_id, kind, params, "limit") values ('alice', 'local', '{}', 10) returning id
    `;
    searchId = s!.id;
    for (const domain of ['acme.dk', 'beta.dk', 'bare.dk']) {
      const [c] = await db.sql<{ id: string }[]>`
        insert into companies (search_id, clerk_user_id, name, domain, website, source)
        values (${searchId}, 'alice', ${domain}, ${domain}, ${`https://${domain}/`}, 'test') returning id
      `;
      await db.sql`
        insert into emails (company_id, search_id, clerk_user_id, address, kind, verification)
        values (${c!.id}, ${searchId}, 'alice', ${`info@${domain}`}, 'generic', 'valid')
      `;
    }
    // acme.dk and beta.dk were crawled with text; bare.dk has none kept.
    for (const domain of ['acme.dk', 'beta.dk', 'bare.dk']) {
      await db.sql`insert into domains (domain, crawl_status, crawled_at, recheck_at) values (${domain}, 'done', now(), now() + interval '30 days')`;
    }
    await db.sql`insert into domain_pages (domain, url, title, description, text) values ('acme.dk', ${about.url}, ${about.title}, ${about.description}, ${about.text})`;
    await db.sql`insert into domain_pages (domain, url, text) values ('beta.dk', 'https://beta.dk/', 'Welcome to our website.')`;
  });

  async function job(): Promise<Job> {
    const res = await queueOpeners(db.sql, 'alice', searchId, { redo: false });
    expect(res).toEqual({ queued: 3, skipped: 0 });
    const [row] = await db.sql<{ id: string; payload: Record<string, unknown> }[]>`select id, payload from jobs where type = 'opener'`;
    return { id: String(row!.id), type: 'opener', payload: row!.payload, searchId: null, attempts: 1, maxAttempts: 3 };
  }

  const openers = () =>
    db.sql<{ domain: string; opener_status: string; opener: string | null; opener_quote: string | null; opener_source_url: string | null }[]>`
      select domain, opener_status, opener, opener_quote, opener_source_url from companies order by domain
    `;

  it('drafts in one Claude call and keeps only lines backed by the page', async () => {
    const j = await job();
    // Companies with text are keyed c1, c2 ... in id order.
    const withText = await db.sql<{ domain: string }[]>`select domain from companies where domain <> 'bare.dk' order by id`;
    const key = (domain: string) => `c${withText.findIndex((r) => r.domain === domain) + 1}`;
    reply = {
      openers: [
        { company: key('acme.dk'), line: 'Open on Saturdays in Aarhus since 1998.', quote: 'behandlet familier i Aarhus siden 1998', sourceUrl: about.url },
        // Invented: beta.dk's page says nothing about staff.
        { company: key('beta.dk'), line: 'Your 40 staff stand out.', quote: 'We have 40 staff members', sourceUrl: 'https://beta.dk/' },
      ],
    };

    await runOpener({ sql: db.sql, ai, log: silentLog }, j);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.tier).toBe('bulk');
    expect(calls[0]!.task).toBe('opener');
    expect(calls[0]!.prompt).not.toContain('bare.dk');
    expect(await openers()).toEqual([
      {
        domain: 'acme.dk',
        opener_status: 'done',
        opener: 'Open on Saturdays in Aarhus since 1998.',
        opener_quote: 'behandlet familier i Aarhus siden 1998',
        opener_source_url: about.url,
      },
      { domain: 'bare.dk', opener_status: 'none', opener: null, opener_quote: null, opener_source_url: null },
      { domain: 'beta.dk', opener_status: 'none', opener: null, opener_quote: null, opener_source_url: null },
    ]);
  });

  it('includes the site profile when the account has one', async () => {
    await db.sql`
      insert into site_profiles (clerk_user_id, website, domain, profile)
      values ('alice', 'https://smile.dk/', 'smile.dk', ${db.sql.json({ name: 'Smilestudio', summary: 'Dental marketing.', offer: 'Booking sites for clinics', audience: 'Dental clinics', proofPoints: [], voice: [], language: 'en', country: null })})
    `;
    reply = { openers: [] };
    await runOpener({ sql: db.sql, ai, log: silentLog }, await job());
    expect(calls[0]!.prompt).toContain('Offer: Booking sites for clinics');
  });

  it('marks the batch failed when Claude fails, and a given up job too', async () => {
    reply = new AiError('budget_exceeded', 'spent');
    await runOpener({ sql: db.sql, ai, log: silentLog }, await job());
    expect((await openers()).map((r) => r.opener_status)).toEqual(['failed', 'none', 'failed']);

    await db.sql`update companies set opener_status = 'queued'`;
    const [row] = await db.sql<{ payload: Record<string, unknown> }[]>`select payload from jobs where type = 'opener'`;
    await onOpenerGaveUp({ sql: db.sql }, { id: '1', type: 'opener', payload: row!.payload, searchId: null, attempts: 3, maxAttempts: 3 });
    expect((await openers()).map((r) => r.opener_status)).toEqual(['failed', 'failed', 'failed']);
  });

  it('skips companies that are no longer queued', async () => {
    const j = await job();
    await db.sql`update companies set opener_status = 'done', opener = 'kept'`;
    await runOpener({ sql: db.sql, ai, log: silentLog }, j);
    expect(calls).toHaveLength(0);
    expect((await openers()).map((r) => r.opener)).toEqual(['kept', 'kept', 'kept']);
  });
});
