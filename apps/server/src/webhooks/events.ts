// Turning pipeline changes into webhook deliveries (docs/SPEC.md,
// "Webhooks"). Each function inserts one pending delivery per matching
// webhook, inside the caller's transaction, and is safe to call twice: the
// unique key on (webhook, event, search, company) drops repeats.

import type { Sql, TransactionSql } from 'postgres';
import { domainSuppressedSql, suppressedSql } from '../leads/suppression.js';

type Db = Sql | TransactionSql;

/** Webhooks of the search's owner that want `event` for this search, as a SQL fragment over `s` and `w`. */
function matching(sql: Db, event: string) {
  return sql`
    w.clerk_user_id = s.clerk_user_id
    and w.enabled
    and ${event} = any(w.events)
    and (w.scope = 'all' or s.drop_id is not null)
    and (w.drop_id is null or w.drop_id = s.drop_id)
  `;
}

/** A company worth announcing: it has a valid address we may still hand over. */
function hasValidLead(sql: Db) {
  return sql`
    not ${domainSuppressedSql(sql, 'c.domain')}
    and exists (
      select 1 from emails e
      where e.company_id = c.id and e.verification = 'valid' and not ${suppressedSql(sql, 'e.address')}
    )
  `;
}

/**
 * lead.ready for one company, once nothing about it is left to check. Call
 * it after recording a check, with the company row locked so two checks
 * finishing together cannot both miss the last one.
 */
export async function leadSettled(sql: Db, companyId: string): Promise<number> {
  const rows = await sql`
    insert into webhook_deliveries (webhook_id, event, search_id, company_id)
    select w.id, 'lead.ready', s.id, c.id
    from companies c
    join searches s on s.id = c.search_id
    join webhooks w on ${matching(sql, 'lead.ready')}
    where c.id = ${companyId}
      and c.crawl_status <> 'pending'
      and not exists (select 1 from emails e where e.company_id = c.id and e.verification is null)
      and ${hasValidLead(sql)}
    on conflict do nothing
    returning id
  `;
  return rows.length;
}

/**
 * A search ended: search.finished, plus lead.ready for every company with a
 * valid address that was not announced yet. A search that stops at the
 * quota leaves some addresses unchecked for good, so those companies would
 * otherwise never settle.
 */
export async function searchFinished(sql: Db, searchId: string): Promise<number> {
  const leads = await sql`
    insert into webhook_deliveries (webhook_id, event, search_id, company_id)
    select w.id, 'lead.ready', s.id, c.id
    from companies c
    join searches s on s.id = c.search_id
    join webhooks w on ${matching(sql, 'lead.ready')}
    where c.search_id = ${searchId} and ${hasValidLead(sql)}
    order by c.created_at, c.id
    on conflict do nothing
    returning id
  `;
  const finished = await sql`
    insert into webhook_deliveries (webhook_id, event, search_id)
    select w.id, 'search.finished', s.id
    from searches s
    join webhooks w on ${matching(sql, 'search.finished')}
    where s.id = ${searchId} and s.status in ('done', 'failed')
    on conflict do nothing
    returning id
  `;
  return leads.length + finished.length;
}
