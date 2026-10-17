// The lead-quality eval's judges (eval-run.ts). After a run, Claude grades a
// seeded sample per entry against the entry's intent: does the company fit
// (Haiku, cheap) and would a seller happily cold email the address (Sonnet).
// Judge calls run as their own user, so their cost never mixes with the
// pipeline's.

import type { Sql } from 'postgres';
import { z } from 'zod';
import type { Verification } from '@nvoke/shared';
import type { Ai } from '../ai/client.js';
import { decodeBody, fetchCapped } from '../leads/http.js';
import { pageText } from '../leads/page-text.js';
import { samplePreferring, sample, type EmailVerdict, type EntryJudgement, type IcpVerdict } from './eval-metrics.js';

export const JUDGE_USER = 'eval-judge';
export const ICP_SAMPLE = 25;
export const EMAIL_SAMPLE = 30;

export interface JudgeCompany {
  id: string;
  name: string;
  domain: string;
  website: string;
  category: string | null;
  location: string | null;
  title: string;
  description: string;
}

export interface JudgeEmail {
  id: string;
  address: string;
  kind: string;
  name: string | null;
  title: string | null;
  company: string;
  domain: string;
  verification: Verification | null;
}

/** Homepage title and meta description, live, within 10 seconds. Empty on any failure. */
async function liveHead(website: string): Promise<{ title: string; description: string }> {
  try {
    const res = await fetchCapped(website, { timeoutMs: 10_000, maxBytes: 500_000 });
    if (!res.ok) return { title: '', description: '' };
    const page = pageText(decodeBody(res.body, res.headers.get('content-type')), res.url, 0);
    return { title: page.title, description: page.description };
  } catch {
    return { title: '', description: '' };
  }
}

/** The ICP sample of an entry's searches: stored homepage text where the crawl kept it, else fetched live. */
export async function icpSample(sql: Sql, searchIds: string[], rng: () => number): Promise<JudgeCompany[]> {
  const rows = await sql<{ id: string; name: string; domain: string; website: string; category: string | null; location: string | null }[]>`
    select id, name, domain, website, category, location from companies
    where search_id in ${sql(searchIds)} order by id
  `;
  const picked = sample(rows, ICP_SAMPLE, rng);
  if (picked.length === 0) return [];
  const pages = await sql<{ domain: string; title: string; description: string }[]>`
    select distinct on (domain) domain, title, description from domain_pages
    where domain in ${sql(picked.map((c) => c.domain))}
    order by domain, length(url)
  `;
  const stored = new Map(pages.map((p) => [p.domain, p]));
  return Promise.all(
    picked.map(async (c) => {
      const page = stored.get(c.domain);
      const head = page && (page.title || page.description) ? page : await liveHead(c.website);
      return { ...c, title: head.title, description: head.description };
    }),
  );
}

/**
 * The would-email sample: what the results show by default (personal
 * addresses, and a role inbox only for a company with no personal one),
 * valid addresses first, any others to fill it up.
 */
export async function emailSample(sql: Sql, searchIds: string[], personColumns: PersonColumns, rng: () => number): Promise<JudgeEmail[]> {
  const rows = await sql<JudgeEmail[]>`
    select e.id, e.address, e.kind, e.verification, c.name as company, c.domain,
      ${sql.unsafe(personColumns.name)} as name, ${sql.unsafe(personColumns.title)} as title
    from emails e join companies c on c.id = e.company_id
    where e.search_id in ${sql(searchIds)}
      and (e.kind = 'personal' or not exists (
        select 1 from emails p where p.company_id = e.company_id and p.kind = 'personal' and p.verification = 'valid'
      ))
    order by e.id
  `;
  return samplePreferring(rows, EMAIL_SAMPLE, rng, (e) => e.verification === 'valid');
}

/** SQL expressions for the optional person columns of `emails e`, null where the column is absent. */
export interface PersonColumns {
  name: string;
  title: string;
  seniority: string;
  foundVia: string;
  present: string[];
}

/** Reads which person columns the emails table has (1600_people adds them), so the eval runs on older schemas too. */
export async function personColumns(sql: Sql): Promise<PersonColumns> {
  const rows = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema = current_schema() and table_name = 'emails'
  `;
  const have = new Set(rows.map((r) => r.column_name));
  const present = ['person_name', 'full_name', 'first_name', 'last_name', 'title', 'job_title', 'seniority', 'found_via'].filter((c) => have.has(c));
  const nameParts = ['person_name', 'full_name'].filter((c) => have.has(c)).map((c) => `e.${c}`);
  const firstLast = ['first_name', 'last_name'].filter((c) => have.has(c));
  if (firstLast.length > 0) nameParts.push(`nullif(trim(concat_ws(' ', ${firstLast.map((c) => `e.${c}`).join(', ')})), '')`);
  const title = ['title', 'job_title'].filter((c) => have.has(c)).map((c) => `e.${c}`);
  return {
    name: nameParts.length ? `coalesce(${nameParts.join(', ')})::text` : 'null::text',
    title: title.length ? `coalesce(${title.join(', ')})::text` : 'null::text',
    seniority: have.has('seniority') ? 'e.seniority::text' : 'null::text',
    foundVia: have.has('found_via') ? 'e.found_via::text' : 'null::text',
    present,
  };
}

const IcpAnswer = z.object({
  verdicts: z.array(
    z.object({
      n: z.number().int().describe('The number of the company in the list.'),
      fit: z.number().int().min(0).max(2).describe('0 wrong, 1 adjacent, 2 clear fit.'),
      reason: z.string().describe('A few words on why.'),
    }),
  ),
});

const EmailAnswer = z.object({
  verdicts: z.array(
    z.object({
      n: z.number().int().describe('The number of the address in the list.'),
      yes: z.boolean().describe('Whether the seller would happily cold email this address.'),
      reason: z.string().describe('A few words on why.'),
    }),
  ),
});

const line = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function icpPrompt(intent: string, companies: JudgeCompany[]): string {
  return [
    `The seller's target customers: ${intent}`,
    '',
    'Companies a lead finder returned:',
    ...companies.map((c, i) =>
      [
        `${i + 1}. ${line(c.name)} (${c.domain})`,
        c.category ? `category: ${line(c.category)}` : '',
        c.location ? `location: ${line(c.location)}` : '',
        c.title ? `homepage title: ${line(c.title)}` : '',
        c.description ? `description: ${line(c.description)}` : '',
      ]
        .filter(Boolean)
        .join('; '),
    ),
  ].join('\n');
}

export function emailPrompt(intent: string, emails: JudgeEmail[]): string {
  return [
    `The seller's target customers: ${intent}`,
    '',
    'Addresses a lead finder returned:',
    ...emails.map((e, i) =>
      [
        `${i + 1}. ${e.address}`,
        `kind: ${e.kind}`,
        e.name ? `name: ${line(e.name)}` : '',
        e.title ? `title: ${line(e.title)}` : '',
        `company: ${line(e.company)} (${e.domain})`,
        `verification: ${e.verification ?? 'not checked'}`,
      ]
        .filter(Boolean)
        .join('; '),
    ),
  ].join('\n');
}

const ICP_SYSTEM =
  'You grade lead lists for an outbound seller. For every company, say how well it matches the target customers: 2 when it clearly is one, 1 when it is adjacent (related business, wrong size or place, unclear), 0 when it is wrong (another industry, a directory, a news site, a big brand that is not a buyer). Judge only from what is given. Answer for every company.';

const EMAIL_SYSTEM =
  'You grade email addresses for an outbound seller. For every address, say yes only when the seller would happily send a cold email to it: a reachable, named decision maker or clearly relevant person at a company that fits the target customers. Say no for role inboxes (info@, support@, hello@, office@, kontakt@ and the like), for companies that do not fit, and for addresses whose verification is invalid, unknown or missing. Answer for every address.';

async function judgeIcp(ai: Ai, intent: string, companies: JudgeCompany[]): Promise<EntryJudgement['icp']> {
  if (companies.length === 0) return { verdicts: [], meanFit: null, clearFitShare: null, costUsd: 0 };
  const res = await ai.structured({
    userId: JUDGE_USER,
    task: 'eval-icp',
    tier: 'bulk',
    system: ICP_SYSTEM,
    prompt: icpPrompt(intent, companies),
    schema: IcpAnswer,
    toolName: 'grade_companies',
    toolDescription: 'One verdict per company, by its number.',
    maxTokens: 4096,
  });
  const verdicts: IcpVerdict[] = [];
  for (const v of res.data.verdicts) {
    const c = companies[v.n - 1];
    if (c && !verdicts.some((x) => x.companyId === c.id)) verdicts.push({ companyId: c.id, name: c.name, domain: c.domain, fit: v.fit, reason: v.reason });
  }
  const mean = verdicts.length ? verdicts.reduce((n, v) => n + v.fit, 0) / verdicts.length : null;
  const share = verdicts.length ? verdicts.filter((v) => v.fit === 2).length / verdicts.length : null;
  return { verdicts, meanFit: mean, clearFitShare: share, costUsd: res.costUsd };
}

async function judgeEmails(ai: Ai, intent: string, emails: JudgeEmail[]): Promise<EntryJudgement['wouldEmail']> {
  if (emails.length === 0) return { verdicts: [], yes: 0, sampled: 0, costUsd: 0 };
  const res = await ai.structured({
    userId: JUDGE_USER,
    task: 'eval-would-email',
    tier: 'quality',
    system: EMAIL_SYSTEM,
    prompt: emailPrompt(intent, emails),
    schema: EmailAnswer,
    toolName: 'grade_addresses',
    toolDescription: 'One verdict per address, by its number.',
    maxTokens: 4096,
  });
  const verdicts: EmailVerdict[] = [];
  for (const v of res.data.verdicts) {
    const e = emails[v.n - 1];
    if (!e || verdicts.some((x) => x.address === e.address && x.domain === e.domain)) continue;
    verdicts.push({
      address: e.address,
      kind: e.kind,
      name: e.name,
      title: e.title,
      company: e.company,
      domain: e.domain,
      verification: e.verification,
      yes: v.yes,
      reason: v.reason,
    });
  }
  return { verdicts, yes: verdicts.filter((v) => v.yes).length, sampled: emails.length, costUsd: res.costUsd };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Both judges for one entry. A failed judge is reported, not thrown. */
export async function judgeEntry(
  ai: Ai,
  sql: Sql,
  entry: { id: string; intent: string; searchIds: string[] },
  columns: PersonColumns,
  rng: () => number,
): Promise<EntryJudgement> {
  const companies = await icpSample(sql, entry.searchIds, rng);
  const emails = await emailSample(sql, entry.searchIds, columns, rng);
  const [icp, wouldEmail] = await Promise.all([
    judgeIcp(ai, entry.intent, companies).catch((err: unknown) => ({
      verdicts: [],
      meanFit: null,
      clearFitShare: null,
      costUsd: 0,
      error: message(err),
    })),
    judgeEmails(ai, entry.intent, emails).catch((err: unknown) => ({ verdicts: [], yes: 0, sampled: emails.length, costUsd: 0, error: message(err) })),
  ]);
  return { entryId: entry.id, icp, wouldEmail };
}
