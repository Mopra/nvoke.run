// Cleans company names stored before companyNameFrom learned to drop page
// labels and post titles ("Services Offered:", "Website:"). Only names that
// are surely no name (isBadCompanyName) are recomputed, and only where they
// came from a search result or homepage title; a map, a list, an import or
// the user names the company itself. A campaign lead keeps its name once a
// step went out, so a thread never calls the company two things.

import type { Sql } from 'postgres';
import { companyNameFrom, isBadCompanyName } from './domain.js';

/** Sources whose company name was cut from a page title. */
export const TITLE_SOURCES = ['brave', 'serper', 'mwmbl', 'index', 'hiring'];

export interface Rename {
  table: 'companies' | 'campaign_leads';
  id: string;
  domain: string;
  from: string;
  to: string;
}

export interface RenameResult {
  renames: Rename[];
  /** Unsent written emails whose subject or body names the company by its old name. */
  draftsFixed: number;
  /** Written emails the user edited by hand, left alone though they hold the old name. */
  draftsEdited: number;
}

/** Whole word matches of `name`, so "News" never hits "Newsletter". */
function wordPattern(name: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');
}

/** Every bad name with the name it gets; changes nothing unless `apply`. */
export async function renameCompanies(sql: Sql, opts: { apply: boolean }): Promise<RenameResult> {
  // Searches the user edited may hold names they typed; leave those alone.
  const companies = await sql<{ id: string; name: string; domain: string }[]>`
    select c.id, c.name, c.domain
    from companies c join searches s on s.id = c.search_id
    where c.source in ${sql(TITLE_SOURCES)} and s.edited_at is null`;
  // A lead whose company retention dropped keeps its copied name; it is cleaned too.
  const leads = await sql<{ id: string; name: string; domain: string }[]>`
    select l.id, l.company_name as name, l.domain
    from campaign_leads l
    left join companies c on c.id = l.company_id
    where (c.id is null or c.source in ${sql(TITLE_SOURCES)})
      and not exists (
        select 1 from messages m where m.campaign_lead_id = l.id and m.direction = 'out' and m.kind = 'step'
      )`;

  const renames: Rename[] = [];
  for (const [table, rows] of [['companies', companies], ['campaign_leads', leads]] as const) {
    for (const r of rows) {
      if (!isBadCompanyName(r.name)) continue;
      const to = companyNameFrom([r.name], r.domain);
      if (to !== r.name) renames.push({ table, id: r.id, domain: r.domain, from: r.name, to });
    }
  }

  const leadRenames = new Map(renames.filter((r) => r.table === 'campaign_leads').map((r) => [r.id, r]));
  const written = leadRenames.size
    ? await sql<{ campaign_lead_id: string; step: number; subject: string; body: string; edited: boolean }[]>`
        select campaign_lead_id, step, subject, body, edited
        from campaign_steps_written where campaign_lead_id = any(${[...leadRenames.keys()]}::uuid[])`
    : [];
  const drafts = written.flatMap((w) => {
    const r = leadRenames.get(w.campaign_lead_id)!;
    const subject = w.subject.replace(wordPattern(r.from), r.to);
    const body = w.body.replace(wordPattern(r.from), r.to);
    return subject === w.subject && body === w.body ? [] : [{ ...w, subject, body }];
  });
  const fixable = drafts.filter((d) => !d.edited);

  if (opts.apply && renames.length > 0) {
    await sql.begin(async (tx) => {
      const rows = JSON.stringify(renames);
      await tx`
        update companies c set name = r."to"
        from json_to_recordset(${rows}::text::json) as r("table" text, id uuid, "from" text, "to" text)
        where r."table" = 'companies' and c.id = r.id and c.name = r."from"`;
      // Only leads still unsent at this moment; their drafts follow them.
      const renamed = await tx<{ id: string }[]>`
        update campaign_leads l set company_name = r."to"
        from json_to_recordset(${rows}::text::json) as r("table" text, id uuid, "from" text, "to" text)
        where r."table" = 'campaign_leads' and l.id = r.id and l.company_name = r."from"
          and not exists (
            select 1 from messages m where m.campaign_lead_id = l.id and m.direction = 'out' and m.kind = 'step'
          )
        returning l.id`;
      const done = new Set(renamed.map((r) => r.id));
      for (const d of fixable) {
        if (!done.has(d.campaign_lead_id)) continue;
        await tx`
          update campaign_steps_written set subject = ${d.subject}, body = ${d.body}
          where campaign_lead_id = ${d.campaign_lead_id} and step = ${d.step} and not edited`;
      }
    });
  }

  return { renames, draftsFixed: fixable.length, draftsEdited: drafts.length - fixable.length };
}
