// Openers per company (docs/SPEC.md, "Openers"): one drafted first line per
// company, written by Claude from the pages the crawl read on its own site
// (domain_pages), for companies with at least one valid email. Every line
// must rest on words the page states: Claude quotes them, and the line is
// kept only when the quote is found on the page it names. nvoke never sends;
// the line is for the user to copy or export.

import type { Logger } from 'pino';
import type { Sql } from 'postgres';
import { z } from 'zod';
import { OPENER_BATCH, OPENER_MAX_LENGTH, type DraftOpenersRequest, type DraftOpenersResponse, type SiteProfileFields } from '@nvoke/shared';
import { AiError, type Ai } from '../ai/client.js';
import { domainPages } from '../leads/domain-cache.js';
import type { SitePage } from '../leads/page-text.js';
import { domainSuppressedSql, suppressedSql } from '../leads/suppression.js';
import { getSiteProfile } from '../profile/site-profile.js';
import { enqueue, type Job } from '../worker/queue.js';

/** A quote shorter than this proves nothing. */
const QUOTE_MIN = 12;
const QUOTE_MAX = 300;

/** What Claude answers per batch. Keys are the `c1`, `c2` ... of the prompt, so no id has to be copied. */
export const ClaudeOpeners = z.object({
  openers: z.array(
    z.object({
      company: z.string().describe('The key of the company, e.g. "c1".'),
      line: z.string().nullable().describe('The first line, or null when the pages hold no specific fact.'),
      quote: z.string().nullable().describe('The words on the page the line rests on, copied exactly.'),
      sourceUrl: z.string().nullable().describe('The url of the page the quote is on, exactly as given.'),
    }),
  ),
});
export type ClaudeOpeners = z.infer<typeof ClaudeOpeners>;

const SYSTEM = `You write the first line of a cold email from the sender to one company, for each company given. The sender copies it into their own email; nothing is sent for them.

Each line:
- Rests on one specific fact the company's own pages state: what they make, a service, a place, a year, a named product or customer. Copy the words it rests on exactly, as they appear on the page, into "quote" (one short passage, under 300 characters), and that page's url into "sourceUrl".
- Is one plain sentence of at most 200 characters, in the language of the company's pages.
- States only what the page says. Never invent facts, numbers, names, praise or a shared history, and never claim the sender did, saw or knows anything beyond the sender profile.
- May link the fact to what the sender offers, in plain words, when a sender profile is given.
- Has no greeting, no names of people, no placeholders or merge tags, no brackets, no exclamation marks, no flattery ("impressive", "love", "amazing") and no dashes as punctuation.

When the pages hold nothing specific (a parked domain, a login page, only generic slogans), answer line, quote and sourceUrl as null. A null is better than a vague line.`;

export interface OpenerCompany {
  key: string;
  name: string;
  domain: string;
  category: string | null;
  location: string | null;
  pages: SitePage[];
}

function attr(v: string): string {
  return v.replace(/[<>"]/g, ' ');
}

function senderBlock(profile: SiteProfileFields | null): string {
  if (!profile) return '<sender>Not given. Write about the company only.</sender>';
  const lines = [
    `Name: ${profile.name}`,
    `What they do: ${profile.summary}`,
    `Offer: ${profile.offer}`,
    `Sells to: ${profile.audience}`,
    profile.proofPoints.length ? `Proof: ${profile.proofPoints.join('; ')}` : '',
  ].filter(Boolean);
  return `<sender>\n${lines.join('\n')}\n</sender>`;
}

/** The prompt for one batch: the sender, then each company with its pages. */
export function openerPrompt(profile: SiteProfileFields | null, companies: OpenerCompany[]): string {
  const blocks = companies.map((c) => {
    const meta = [`key="${c.key}"`, `name="${attr(c.name)}"`, `domain="${c.domain}"`];
    if (c.category) meta.push(`category="${attr(c.category)}"`);
    if (c.location) meta.push(`location="${attr(c.location)}"`);
    const pages = c.pages.map(
      (p) => `<page url="${attr(p.url)}">\n<title>${p.title}</title>\n<description>${p.description}</description>\n${p.text}\n</page>`,
    );
    return `<company ${meta.join(' ')}>\n${pages.join('\n')}\n</company>`;
  });
  return `${senderBlock(profile)}\n\n${blocks.join('\n\n')}`;
}

/** Lowercased, quotes and dashes unified, whitespace collapsed: how a quote is matched to a page. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’‚′`]/g, "'")
    .replace(/[“”„″«»]/g, '"')
    .replace(/[‐-―−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Placeholders and markup an opener must not hold: {{first_name}}, [Company], <name>, %NAME%. */
const MERGE_TAG = /[{}[\]<>]|%[A-Za-z_]+%|\b(first ?name|last ?name|company ?name|your name)\b/i;

export type CheckedOpener =
  | { status: 'done'; line: string; quote: string; sourceUrl: string }
  | { status: 'none' };

/**
 * Keeps Claude's line only when it is plain text of a sane length and its
 * quote is on the page it names, among this company's pages.
 */
export function checkOpener(answer: ClaudeOpeners['openers'][number] | undefined, pages: SitePage[]): CheckedOpener {
  if (!answer?.line || !answer.quote || !answer.sourceUrl) return { status: 'none' };
  const line = answer.line
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!line || line.length > OPENER_MAX_LENGTH || MERGE_TAG.test(line)) return { status: 'none' };
  const quote = answer.quote.replace(/\s+/g, ' ').trim();
  if (quote.length < QUOTE_MIN || quote.length > QUOTE_MAX) return { status: 'none' };
  const url = answer.sourceUrl.trim();
  const page = pages.find((p) => p.url === url);
  if (!page) return { status: 'none' };
  const haystack = normalizeForMatch(`${page.title}\n${page.description}\n${page.text}`);
  if (!haystack.includes(normalizeForMatch(quote))) return { status: 'none' };
  return { status: 'done', line, quote, sourceUrl: page.url };
}

/**
 * Marks the asked companies of a search queued and queues their jobs, a
 * batch per job. Only companies with a valid, unsuppressed email qualify,
 * and without `redo` only those with no opener yet or a failed one. Null
 * when the search is not the user's.
 */
export async function queueOpeners(
  sql: Sql,
  userId: string,
  searchId: string,
  req: DraftOpenersRequest,
): Promise<DraftOpenersResponse | null> {
  return sql.begin(async (tx) => {
    const [search] = await tx`select id from searches where id = ${searchId} and clerk_user_id = ${userId}`;
    if (!search) return null;
    const only = req.companyIds ? tx`and c.id in ${tx(req.companyIds)}` : tx``;
    const [asked] = await tx<{ n: number }[]>`
      select count(*)::int as n from companies c where c.search_id = ${searchId} and c.clerk_user_id = ${userId} ${only}
    `;
    const queued = await tx<{ id: string }[]>`
      update companies c set opener_status = 'queued'
      where c.search_id = ${searchId} and c.clerk_user_id = ${userId} ${only}
        and not ${domainSuppressedSql(tx, 'c.domain')}
        and exists (
          select 1 from emails e
          where e.company_id = c.id and e.verification = 'valid' and not ${suppressedSql(tx, 'e.address')}
        )
        and ${req.redo ? tx`(c.opener_status is null or c.opener_status <> 'queued')` : tx`(c.opener_status is null or c.opener_status = 'failed')`}
      returning c.id
    `;
    const ids = queued.map((r) => r.id).sort();
    const jobs = [];
    for (let i = 0; i < ids.length; i += OPENER_BATCH) {
      // No search id: openers do not hold a running search open, and cancel leaves them be.
      jobs.push({ type: 'opener' as const, payload: { companyIds: ids.slice(i, i + OPENER_BATCH) } });
    }
    await enqueue(tx, jobs);
    return { queued: ids.length, skipped: Math.max(0, (asked?.n ?? 0) - ids.length) };
  });
}

export interface OpenerDeps {
  sql: Sql;
  ai: Ai;
  log: Logger;
}

interface Row {
  id: string;
  clerk_user_id: string;
  name: string;
  domain: string;
  category: string | null;
  location: string | null;
}

function companyIds(job: Job): string[] {
  const ids = job.payload.companyIds;
  return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string').slice(0, OPENER_BATCH) : [];
}

async function settle(sql: Sql, id: string, result: CheckedOpener | { status: 'failed' }): Promise<void> {
  const done = result.status === 'done' ? result : null;
  await sql`
    update companies set
      opener_status = ${result.status}, opener = ${done?.line ?? null},
      opener_quote = ${done?.quote ?? null}, opener_source_url = ${done?.sourceUrl ?? null}, opener_at = now()
    where id = ${id} and opener_status = 'queued'
  `;
}

/** The opener job: one Claude call for up to OPENER_BATCH queued companies of one user. */
export async function runOpener(deps: OpenerDeps, job: Job): Promise<void> {
  const ids = companyIds(job);
  if (ids.length === 0) return;
  const rows = await deps.sql<Row[]>`
    select id, clerk_user_id, name, domain, category, location from companies
    where id in ${deps.sql(ids)} and opener_status = 'queued'
    order by id
  `;
  if (rows.length === 0) return;
  const userId = rows[0]!.clerk_user_id;
  const mine = rows.filter((r) => r.clerk_user_id === userId);

  const pages = await domainPages(deps.sql, [...new Set(mine.map((r) => r.domain))]);
  const companies: Array<OpenerCompany & { id: string }> = [];
  for (const r of mine) {
    const own = pages.get(r.domain) ?? [];
    // No text kept (a cached crawl from before openers, or a site read only by the desktop): nothing to build on.
    if (own.length === 0) await settle(deps.sql, r.id, { status: 'none' });
    else companies.push({ id: r.id, key: `c${companies.length + 1}`, name: r.name, domain: r.domain, category: r.category, location: r.location, pages: own });
  }
  if (companies.length === 0) return;

  const profile = (await getSiteProfile(deps.sql, userId))?.profile ?? null;
  let answer: ClaudeOpeners;
  try {
    const res = await deps.ai.structured({
      userId,
      task: 'opener',
      tier: 'bulk',
      system: SYSTEM,
      prompt: openerPrompt(profile, companies),
      schema: ClaudeOpeners,
      toolName: 'save_openers',
      toolDescription: 'Saves one opener per company key.',
      maxTokens: 300 * companies.length + 200,
    });
    answer = res.data;
  } catch (err) {
    // Claude declined, gave nothing usable, or the budget is spent: retrying would not help.
    if (!(err instanceof AiError)) throw err;
    deps.log.warn({ err, userId, companies: companies.length }, 'opener: Claude failed');
    for (const c of companies) await settle(deps.sql, c.id, { status: 'failed' });
    return;
  }

  const byKey = new Map(answer.openers.map((o) => [o.company.trim(), o]));
  let done = 0;
  for (const c of companies) {
    const checked = checkOpener(byKey.get(c.key), c.pages);
    if (checked.status === 'done') done++;
    await settle(deps.sql, c.id, checked);
  }
  deps.log.info({ userId, companies: companies.length, done }, 'opener: batch done');
}

/** An opener job that ran out of attempts leaves its companies failed, so they can be asked again. */
export async function onOpenerGaveUp(deps: Pick<OpenerDeps, 'sql'>, job: Job): Promise<void> {
  const ids = companyIds(job);
  if (ids.length === 0) return;
  await deps.sql`
    update companies set opener_status = 'failed', opener_at = now()
    where id in ${deps.sql(ids)} and opener_status = 'queued'
  `;
}
