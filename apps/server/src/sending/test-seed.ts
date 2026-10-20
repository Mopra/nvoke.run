// Rows for the sending tests: an account, a mailbox with a sealed password,
// a running campaign and leads with their written steps. Inserted directly,
// so these tests do not depend on the campaign and mailbox modules.

import { randomBytes } from 'node:crypto';
import type { Sql } from 'postgres';
import { pino } from 'pino';
import { createSecrets, type Secrets } from '../crypto/secrets.js';
import { ensureAccount } from '../leads/quota.js';

export const silentLog = pino({ level: 'silent' });

export function testSecrets(): Secrets {
  return createSecrets(randomBytes(32).toString('base64'));
}

/** Every day, every hour: a send is due as soon as the schedule allows. */
export const ALWAYS = { days: [1, 2, 3, 4, 5, 6, 7], startHour: 0, endHour: 24 };

export async function seedMailbox(
  sql: Sql,
  secrets: Secrets,
  o: { userId?: string; address?: string; dailyCap?: number; lastSendAt?: Date | null } = {},
): Promise<string> {
  const userId = o.userId ?? 'u1';
  await ensureAccount(sql, userId);
  const address = o.address ?? 'me@sender.io';
  const [row] = await sql<{ id: string }[]>`
    insert into mailboxes (clerk_user_id, address, display_name, provider, smtp_host, smtp_port, smtp_secure,
      imap_host, imap_port, username, secret, daily_cap, warm, status, signature, last_send_at)
    values (${userId}, ${address}, 'Mo Sender', 'smtp', 'smtp.sender.io', 465, true, 'imap.sender.io', 993,
      ${address}, ${secrets.seal('app-password')}, ${o.dailyCap ?? 30}, true, 'active', 'Mo\nSender ApS', ${o.lastSendAt ?? null})
    returning id`;
  return row!.id;
}

export async function seedCampaign(
  sql: Sql,
  mailboxIds: string[],
  o: { userId?: string; steps?: number; autopilot?: boolean; status?: string } = {},
): Promise<string> {
  const steps = Array.from({ length: o.steps ?? 2 }, (_, i) => ({ waitDays: i === 0 ? 0 : 3, brief: `step ${i + 1}` }));
  const [row] = await sql<{ id: string }[]>`
    insert into campaigns (clerk_user_id, name, status, source, autopilot, steps, schedule, started_at)
    values (${o.userId ?? 'u1'}, 'Test', ${o.status ?? 'scheduled'}, 'list', ${o.autopilot ?? false},
      ${sql.json(steps)}, ${sql.json(ALWAYS)}, null)
    returning id`;
  for (const m of mailboxIds) await sql`insert into campaign_mailboxes (campaign_id, mailbox_id) values (${row!.id}, ${m})`;
  return row!.id;
}

export async function seedLead(
  sql: Sql,
  campaignId: string,
  mailboxId: string,
  o: { address: string; userId?: string; nextSendAt?: Date; country?: string | null; emailId?: string | null; steps?: number },
): Promise<string> {
  const domain = o.address.slice(o.address.indexOf('@') + 1);
  const [row] = await sql<{ id: string }[]>`
    insert into campaign_leads (campaign_id, clerk_user_id, email_id, address, first_name, company_name, domain,
      country, timezone, mailbox_id, status, next_send_at, written_at)
    values (${campaignId}, ${o.userId ?? 'u1'}, ${o.emailId ?? null}, ${o.address}, 'Jane', 'Acme', ${domain},
      ${o.country === undefined ? 'GB' : o.country}, 'UTC', ${mailboxId}, 'queued',
      ${o.nextSendAt ?? new Date('2026-01-01T00:00:00Z')}, now())
    returning id`;
  for (let step = 1; step <= (o.steps ?? 2); step++) {
    await sql`
      insert into campaign_steps_written (campaign_lead_id, step, subject, body)
      values (${row!.id}, ${step}, ${`Subject ${step}`}, ${`Hi Jane, body ${step}.`})`;
  }
  return row!.id;
}

/** A found address in a search, so a bounce has an emails row to mark. */
export async function seedEmail(sql: Sql, address: string, userId = 'u1'): Promise<string> {
  await ensureAccount(sql, userId);
  const [search] = await sql<{ id: string }[]>`
    insert into searches (clerk_user_id, kind, "limit") values (${userId}, 'local', 10) returning id`;
  const domain = address.slice(address.indexOf('@') + 1);
  const [company] = await sql<{ id: string }[]>`
    insert into companies (search_id, clerk_user_id, name, domain, website, source)
    values (${search!.id}, ${userId}, 'Acme', ${domain}, ${`https://${domain}/`}, 'test') returning id`;
  const [email] = await sql<{ id: string }[]>`
    insert into emails (company_id, search_id, clerk_user_id, address, kind, verification)
    values (${company!.id}, ${search!.id}, ${userId}, ${address}, 'personal', 'valid') returning id`;
  return email!.id;
}
