// Leads from outside nvoke's own finds (docs/sending/plan.md, "Own
// products"): a list someone checked by hand, each lead with the address
// its business publishes and the fact it was picked for. They land as a
// domains search marked `import`, so a campaign follows them like any
// search: the crawl only fills the page cache that write.ts reads (it stores
// no addresses for an import, worker/pipeline.ts finishCrawl), and the
// verify job checks the imported address.

import type { Sql } from 'postgres';
import { z } from 'zod';
import { classifyAddress, isPlatformDomain, isWebmailDomain, normalizeDomain, seniorityOf } from '../leads/domain.js';
import { nameFromDomain } from '../leads/sources/domains.js';
import { isDomainSuppressed, suppressedAddresses } from '../leads/suppression.js';
import { enqueue, verifyPriority, type NewJob } from '../worker/queue.js';

const optional = (max: number) => z.string().trim().min(1).max(max).optional();

export const ImportLead = z.object({
  /** The site, crawled for its pages. */
  domain: z.string().trim().min(1).max(253),
  /** The published contact address the campaign writes to. May be on another domain than `domain`. */
  address: z.string().trim().toLowerCase().pipe(z.email()),
  name: optional(300),
  firstName: optional(100),
  lastName: optional(100),
  title: optional(200),
  /** Free text, e.g. "Galloway, NJ". */
  location: optional(300),
  /** ISO 3166-1 alpha-2. */
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, 'an ISO country code such as US')
    .optional(),
  category: optional(200),
  /** The checked fact the lead was picked for (companies.fit_reason). */
  fitReason: z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, 500)),
  sourceUrl: z.url().max(2000).optional(),
});
export type ImportLead = z.infer<typeof ImportLead>;

export type ImportSkip = 'bad_domain' | 'suppressed' | 'duplicate';

export interface ImportResult {
  searchId: string;
  /** New companies and addresses. */
  companies: number;
  emails: number;
  /** Companies the search already held, their fit_reason refreshed. */
  refreshed: number;
  skipped: Partial<Record<ImportSkip, number>>;
}

export class ImportError extends Error {}

/** The location the sending gate reads the country from (gate.ts recipientCountry): "Galloway, NJ, US". */
function locationWithCountry(location: string | undefined, country: string | undefined): string | null {
  if (!country) return location ?? null;
  if (!location) return country;
  const last = location.split(',').pop()?.trim().toUpperCase();
  return last === country ? location : `${location}, ${country}`;
}

/**
 * Stores leads in a new import search of the user, or appends them to
 * `opts.searchId` (an import of theirs). Each new company gets a crawl job
 * and each new address a verify job; the search runs until they are done
 * (worker/pipeline.ts maybeFinishSearch). A company the search already
 * holds keeps its row and gets the new fit_reason.
 */
export async function importLeads(
  sql: Sql,
  userId: string,
  leads: ImportLead[],
  opts: { label?: string; searchId?: string; now?: Date } = {},
): Promise<ImportResult> {
  const skipped: Partial<Record<ImportSkip, number>> = {};
  const skip = (reason: ImportSkip) => void (skipped[reason] = (skipped[reason] ?? 0) + 1);

  const seen = new Set<string>();
  const usable: (ImportLead & { site: string })[] = [];
  for (const lead of leads) {
    const site = normalizeDomain(lead.domain);
    if (!site || isPlatformDomain(site) || isWebmailDomain(site)) skip('bad_domain');
    else if (seen.has(lead.address)) skip('duplicate');
    else {
      seen.add(lead.address);
      usable.push({ ...lead, site });
    }
  }
  const blocked = await suppressedAddresses(sql, usable.map((l) => l.address));
  const kept: typeof usable = [];
  for (const lead of usable) {
    if (blocked.has(lead.address) || (await isDomainSuppressed(sql, lead.site))) skip('suppressed');
    else kept.push(lead);
  }

  const now = opts.now ?? new Date();
  return sql.begin(async (tx) => {
    let searchId = opts.searchId;
    if (searchId) {
      const [s] = await tx<{ kind: string; import: boolean }[]>`
        select kind, coalesce(params -> 'import' = 'true'::jsonb, false) as import
        from searches where id = ${searchId} and clerk_user_id = ${userId}
        for update
      `;
      if (!s) throw new ImportError(`search ${searchId} not found`);
      if (s.kind !== 'domains' || !s.import) throw new ImportError(`search ${searchId} is not an import`);
    } else {
      const params = { items: [], import: true, ...(opts.label ? { label: opts.label } : {}) };
      const [s] = await tx<{ id: string }[]>`
        insert into searches (clerk_user_id, kind, params, "limit", status, check_inboxes, created_at, started_at, finished_at)
        values (${userId}, 'domains', ${tx.json(params)}, 1, 'done', true, ${now}, ${now}, ${now})
        returning id
      `;
      searchId = s!.id;
    }

    const jobs: NewJob[] = [];
    let companies = 0;
    let emails = 0;
    let refreshed = 0;
    for (const lead of kept) {
      // A duplicate key keeps the row; xmax <> 0 tells an update from an insert.
      const [company] = await tx<{ id: string; inserted: boolean }[]>`
        insert into companies ${tx({
          search_id: searchId,
          clerk_user_id: userId,
          name: (lead.name ?? nameFromDomain(lead.site)).slice(0, 300),
          domain: lead.site,
          website: `https://${lead.site}/`,
          source: 'import',
          source_ref: lead.sourceUrl ?? null,
          location: locationWithCountry(lead.location, lead.country),
          category: lead.category ?? null,
          fit_reason: lead.fitReason,
        })}
        on conflict (search_id, domain) do update set fit_reason = excluded.fit_reason
        returning id, (xmax = 0) as inserted
      `;
      if (company!.inserted) {
        companies++;
        jobs.push({ type: 'crawl', payload: { companyId: company!.id }, searchId });
      } else refreshed++;

      // The same address on another company of the search is one lead already.
      const [other] = await tx`
        select 1 from emails where search_id = ${searchId} and address = ${lead.address} and company_id <> ${company!.id}
      `;
      if (other) {
        skip('duplicate');
        continue;
      }
      const row = {
        company_id: company!.id,
        search_id: searchId,
        clerk_user_id: userId,
        address: lead.address,
        kind: classifyAddress(lead.address),
        source_url: lead.sourceUrl ?? null,
        first_name: lead.firstName ?? null,
        last_name: lead.lastName ?? null,
        title: lead.title ?? null,
        seniority: seniorityOf(lead.title),
        found_via: 'page',
        confidence: 100,
      };
      const [email] = await tx<{ id: string }[]>`
        insert into emails ${tx(row)}
        on conflict (company_id, address) do nothing
        returning id
      `;
      if (!email) continue;
      emails++;
      jobs.push({ type: 'verify', payload: { emailId: email.id }, searchId, priority: verifyPriority(row) });
    }

    const domains = kept.map((l) => l.site);
    // Running while it has work: the worker sets it done after the last job, and a crawl skips a search that is not running.
    await tx`
      update searches set
        params = jsonb_set(params, '{items}', (
          select coalesce(jsonb_agg(distinct d), '[]'::jsonb)
          from (select jsonb_array_elements_text(params -> 'items') as d union select unnest(${domains}::text[])) x
        )),
        companies_found = companies_found + ${companies},
        emails_found = emails_found + ${emails},
        "limit" = greatest(1, (select count(*)::int from companies where search_id = ${searchId})),
        check_inboxes = true,
        status = case when ${jobs.length > 0} then 'running' else status end,
        error = case when ${jobs.length > 0} then null else error end,
        finished_at = case when ${jobs.length > 0} then null else finished_at end
      where id = ${searchId}
    `;
    await enqueue(tx, jobs);
    return { searchId: searchId!, companies, emails, refreshed, skipped };
  });
}

/** Columns of an import CSV, by header name. `domain`, `address` and `fit_reason` are required. */
const CSV_COLUMNS: Record<string, keyof ImportLead> = {
  domain: 'domain',
  address: 'address',
  name: 'name',
  first_name: 'firstName',
  last_name: 'lastName',
  title: 'title',
  location: 'location',
  country: 'country',
  category: 'category',
  fit_reason: 'fitReason',
  source_url: 'sourceUrl',
};

/** RFC 4180 rows: quoted cells with commas, doubled quotes and line breaks. A BOM is dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface ParsedImport {
  leads: ImportLead[];
  /** Rows that failed validation, by line (CSV, counting the header as 1) or index (JSON, from 1). */
  errors: { line: number; message: string }[];
}

/** Reads an import file: a JSON array of ImportLead, or a CSV with a header row (CSV_COLUMNS). */
export function parseImportFile(name: string, text: string): ParsedImport {
  const raw: { line: number; value: unknown }[] = [];
  if (name.toLowerCase().endsWith('.json')) {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) throw new ImportError('a JSON import is an array of leads');
    value.forEach((v, i) => raw.push({ line: i + 1, value: v }));
  } else {
    const [header, ...rows] = parseCsv(text);
    const keys = (header ?? []).map((h) => CSV_COLUMNS[h.trim().toLowerCase()]);
    for (const required of ['domain', 'address', 'fitReason']) {
      if (!keys.includes(required as keyof ImportLead)) throw new ImportError(`the CSV header needs domain, address and fit_reason`);
    }
    rows.forEach((cells, i) => {
      if (cells.every((c) => c.trim() === '')) return;
      const value: Record<string, string> = {};
      cells.forEach((c, j) => {
        const key = keys[j];
        // An empty cell is a missing value, not an empty one.
        if (key && c.trim() !== '') value[key] = c;
      });
      raw.push({ line: i + 2, value });
    });
  }
  const leads: ImportLead[] = [];
  const errors: ParsedImport['errors'] = [];
  for (const { line, value } of raw) {
    const parsed = ImportLead.safeParse(value);
    if (parsed.success) leads.push(parsed.data);
    else errors.push({ line, message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
  }
  return { leads, errors };
}
