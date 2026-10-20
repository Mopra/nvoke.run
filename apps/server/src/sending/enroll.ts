// Who a campaign writes to (docs/sending/plan.md, "Autopilot"). Enrolling
// takes the source's verified addresses that are not in the campaign yet and
// applies the rules: valid only (catch_all when the campaign allows it),
// named people only when asked, at most per_company per company (highest
// seniority, then confidence), nobody this user contacted in the last 90
// days, nothing suppressed (globally or for this sender), no blocked
// country, and at most daily_new a UTC day. An address that breaks a rule is
// kept as a 'skipped' row with its reason, so the counts show and it is not
// looked at again; one held back by daily_new is left for the next day.

import type { Logger } from 'pino';
import type { Sql, TransactionSql } from 'postgres';
import { domainSuppressedSql, suppressedSql } from '../leads/suppression.js';
import { enqueue } from '../worker/queue.js';
import { CAMPAIGN_COLUMNS, type CampaignRow } from './campaigns.js';
import { isBlockedRecipient, recipientCountry, timezoneFor } from './gate.js';

type Db = Sql | TransactionSql;

/** Leads per write job. */
export const WRITE_BATCH = 10;
/** An address this user wrote to (or enrolled) in another campaign this recently is left alone. */
export const CONTACTED_DAYS = 90;
/** How often the enroll tick looks at an autopilot campaign's source again. */
export const ENROLL_EVERY_MS = 5 * 60_000;

export type SkipReason = 'not_valid' | 'not_person' | 'suppressed' | 'contacted' | 'country' | 'per_company';

export interface EnrollResult {
  enrolled: number;
  skipped: Record<string, number>;
}

interface Candidate {
  email_id: string;
  company_id: string;
  address: string;
  verification: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  seniority: string | null;
  confidence: number | null;
  company_name: string;
  domain: string;
  location: string | null;
  suppressed: boolean;
  contacted: boolean;
}

interface LeadInsert {
  campaign_id: string;
  clerk_user_id: string;
  email_id: string;
  company_id: string;
  address: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string;
  domain: string;
  country: string | null;
  timezone: string;
  mailbox_id: string | null;
  status: 'writing' | 'skipped';
  skip_reason: SkipReason | null;
  created_at: Date;
}

const SENIORITY_RANK: Record<string, number> = { founder: 0, executive: 1, director: 2, manager: 3, staff: 4 };

/** Who goes first within a company: seniority, then confidence, then a name over none. */
export function byPreference(a: Candidate, b: Candidate): number {
  const rank = (c: Candidate) => (c.seniority ? (SENIORITY_RANK[c.seniority] ?? 5) : 5);
  return rank(a) - rank(b) || (b.confidence ?? -1) - (a.confidence ?? -1) || Number(!a.first_name) - Number(!b.first_name);
}

/** The emails rows a campaign draws from. emailIds narrows a list campaign to the ones picked. */
function sourceFilter(tx: Db, c: CampaignRow, emailIds?: string[]) {
  if (emailIds) return emailIds.length ? tx`e.id in ${tx(emailIds)}` : tx`false`;
  if (c.source === 'drop') {
    if (!c.drop_id) return tx`false`;
    // Every search the drop makes from the campaign's creation on.
    return tx`e.search_id in (
      select s.id from searches s
      where s.drop_id = ${c.drop_id} and s.clerk_user_id = ${c.clerk_user_id} and s.created_at >= ${c.created_at}
    )`;
  }
  return c.search_id ? tx`e.search_id = ${c.search_id}` : tx`false`;
}

/**
 * Enrolls what the campaign's source holds that the campaign has not seen,
 * and queues write jobs for the enrolled leads. Run it in a transaction that
 * holds the campaign row, so two workers do not enroll the same lead.
 */
export async function enrollCampaign(
  tx: Db,
  c: CampaignRow,
  now: Date,
  opts: { emailIds?: string[] } = {},
): Promise<EnrollResult> {
  const userId = c.clerk_user_id;
  const since = new Date(now.getTime() - CONTACTED_DAYS * 86_400_000);
  // Only settled addresses: one still being checked comes in on a later tick.
  const rows = await tx<Candidate[]>`
    select e.id as email_id, e.company_id, e.address, e.verification, e.first_name, e.last_name, e.title,
      e.seniority, e.confidence, co.name as company_name, co.domain, co.location,
      (${suppressedSql(tx, 'e.address')} or ${domainSuppressedSql(tx, 'co.domain')} or exists (
        select 1 from send_suppressions ss
        where ss.clerk_user_id = ${userId} and ss.hash = encode(sha256(convert_to(e.address, 'UTF8')), 'hex')
      )) as suppressed,
      exists (
        select 1 from campaign_leads o
        where o.clerk_user_id = ${userId} and o.address = e.address and o.campaign_id <> ${c.id}
          and o.status not in ('skipped', 'failed') and o.created_at > ${since}
      ) as contacted
    from emails e
    join companies co on co.id = e.company_id
    where e.clerk_user_id = ${userId} and e.verification is not null and ${sourceFilter(tx, c, opts.emailIds)}
      and not exists (select 1 from campaign_leads l where l.campaign_id = ${c.id} and l.address = e.address)
    order by e.created_at, e.id
  `;
  if (rows.length === 0) {
    await tx`update campaigns set enrolled_at = ${now} where id = ${c.id}`;
    return { enrolled: 0, skipped: {} };
  }

  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const [today] = await tx<{ n: number }[]>`
    select count(*)::int as n from campaign_leads
    where campaign_id = ${c.id} and status <> 'skipped' and created_at >= ${dayStart}
  `;
  let room = Math.max(0, c.daily_new - (today?.n ?? 0));
  const perCompany = new Map<string, number>();
  for (const r of await tx<{ domain: string; n: number }[]>`
    select domain, count(*)::int as n from campaign_leads where campaign_id = ${c.id} and status <> 'skipped' group by domain
  `) {
    perCompany.set(r.domain, r.n);
  }
  // Sticky mailbox: the one with the fewest leads in this campaign.
  const boxes = await tx<{ id: string; n: number }[]>`
    select cm.mailbox_id as id,
      (select count(*)::int from campaign_leads l where l.campaign_id = cm.campaign_id and l.mailbox_id = cm.mailbox_id and l.status <> 'skipped') as n
    from campaign_mailboxes cm where cm.campaign_id = ${c.id}
    order by cm.mailbox_id
  `;
  const pickMailbox = (): string | null => {
    let best: { id: string; n: number } | undefined;
    for (const b of boxes) if (!best || b.n < best.n) best = b;
    if (!best) return null;
    best.n++;
    return best.id;
  };

  // Companies in the order they were found, each company's people best first.
  const companies = new Map<string, Candidate[]>();
  for (const r of rows) companies.set(r.domain, [...(companies.get(r.domain) ?? []), r]);

  const seen = new Set<string>();
  const inserts: LeadInsert[] = [];
  const skipped: Record<string, number> = {};
  for (const [domain, people] of companies) {
    for (const r of people.sort(byPreference)) {
      // The same address can come from two searches of a drop.
      if (seen.has(r.address)) continue;
      seen.add(r.address);
      const country = recipientCountry({ location: r.location, domain: r.domain });
      let reason: SkipReason | null = null;
      if (r.verification !== 'valid' && !(r.verification === 'catch_all' && c.allow_catch_all)) reason = 'not_valid';
      else if (c.people_only && !r.first_name) reason = 'not_person';
      else if (r.suppressed) reason = 'suppressed';
      else if (r.contacted) reason = 'contacted';
      else if (isBlockedRecipient({ location: r.location, domain: r.domain, address: r.address })) reason = 'country';
      else if ((perCompany.get(domain) ?? 0) >= c.per_company) reason = 'per_company';
      // Over today's ceiling: left out, so it is looked at again tomorrow.
      if (!reason && room <= 0) continue;
      const row: LeadInsert = {
        campaign_id: c.id,
        clerk_user_id: userId,
        email_id: r.email_id,
        company_id: r.company_id,
        address: r.address,
        first_name: r.first_name,
        last_name: r.last_name,
        title: r.title,
        company_name: r.company_name,
        domain: r.domain,
        country,
        timezone: reason ? 'UTC' : timezoneFor(country, r.location),
        mailbox_id: reason ? null : pickMailbox(),
        status: reason ? 'skipped' : 'writing',
        skip_reason: reason,
        created_at: now,
      };
      inserts.push(row);
      if (reason) {
        skipped[reason] = (skipped[reason] ?? 0) + 1;
      } else {
        perCompany.set(domain, (perCompany.get(domain) ?? 0) + 1);
        room--;
      }
    }
  }

  const written: string[] = [];
  for (let i = 0; i < inserts.length; i += 500) {
    const chunk = inserts.slice(i, i + 500);
    const ids = await tx<{ id: string; status: string }[]>`
      insert into campaign_leads ${tx(chunk, 'campaign_id', 'clerk_user_id', 'email_id', 'company_id', 'address', 'first_name', 'last_name', 'title', 'company_name', 'domain', 'country', 'timezone', 'mailbox_id', 'status', 'skip_reason', 'created_at')}
      on conflict (campaign_id, address) do nothing
      returning id, status
    `;
    for (const r of ids) if (r.status === 'writing') written.push(r.id);
  }
  await tx`update campaigns set leads = leads + ${written.length}, enrolled_at = ${now} where id = ${c.id}`;
  await queueWrites(tx, c.id, written);
  return { enrolled: written.length, skipped };
}

/** Queues the write jobs for a campaign's new leads, WRITE_BATCH per job. */
export async function queueWrites(tx: Db, campaignId: string, leadIds: string[]): Promise<void> {
  const ids = [...leadIds].sort();
  const jobs = [];
  for (let i = 0; i < ids.length; i += WRITE_BATCH) {
    jobs.push({ type: 'write' as const, payload: { campaignId, leadIds: ids.slice(i, i + WRITE_BATCH) } });
  }
  await enqueue(tx, jobs);
}

/**
 * The worker's enroll tick: every started autopilot campaign whose source
 * was last looked at ENROLL_EVERY_MS ago or longer. A paused, done or
 * canceled campaign enrolls nothing. Returns how many leads came in.
 */
export async function enrollTick(sql: Sql, log: Logger, now: Date = new Date()): Promise<number> {
  const before = new Date(now.getTime() - ENROLL_EVERY_MS);
  const due = await sql<{ id: string }[]>`
    select id from campaigns
    where autopilot and status in ('scheduled', 'sending') and (enrolled_at is null or enrolled_at <= ${before})
    order by enrolled_at nulls first
    limit 50
  `;
  let total = 0;
  for (const { id } of due) {
    try {
      const res = await sql.begin(async (tx) => {
        const [c] = await tx<CampaignRow[]>`
          select ${tx.unsafe(CAMPAIGN_COLUMNS)} from campaigns c
          where c.id = ${id} and c.autopilot and c.status in ('scheduled', 'sending')
            and (c.enrolled_at is null or c.enrolled_at <= ${before})
          for update skip locked
        `;
        return c ? enrollCampaign(tx, c, now) : null;
      });
      if (res && (res.enrolled > 0 || Object.keys(res.skipped).length > 0)) {
        log.info({ campaignId: id, enrolled: res.enrolled, skipped: res.skipped }, 'enroll: new leads');
      }
      total += res?.enrolled ?? 0;
    } catch (err) {
      log.error({ err, campaignId: id }, 'enroll: campaign failed');
    }
  }
  return total;
}
