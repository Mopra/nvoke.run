// Queries behind /v1/webhooks. Every query is scoped by clerk_user_id.

import type { Sql } from 'postgres';
import {
  WEBHOOK_EVENTS,
  WEBHOOKS_MAX,
  type CreateWebhookRequest,
  type CreateWebhookResponse,
  type UpdateWebhookRequest,
  type Webhook,
  type WebhookDelivery,
  type WebhookDeliveryStatus,
  type WebhookDisabledReason,
  type WebhookEvent,
  type WebhookScope,
} from '@nvoke/shared';
import { newWebhookSecret } from './send.js';

export interface WebhookRow {
  id: string;
  clerk_user_id: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  scope: WebhookScope;
  drop_id: string | null;
  enabled: boolean;
  disabled_reason: WebhookDisabledReason | null;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

const iso = (d: Date | null): string | null => d?.toISOString() ?? null;

function toWebhook(r: WebhookRow): Webhook {
  return {
    id: r.id,
    url: r.url,
    events: r.events,
    scope: r.scope,
    dropId: r.drop_id,
    enabled: r.enabled,
    disabledReason: r.disabled_reason,
    lastSuccessAt: iso(r.last_success_at),
    lastFailureAt: iso(r.last_failure_at),
    lastError: r.last_error,
    createdAt: r.created_at.toISOString(),
  };
}

export async function listWebhooks(sql: Sql, userId: string): Promise<Webhook[]> {
  const rows = await sql<WebhookRow[]>`
    select * from webhooks where clerk_user_id = ${userId} order by created_at desc, id desc
  `;
  return rows.map(toWebhook);
}

/** The row with its secret, for sending. */
export async function getWebhookRow(sql: Sql, userId: string, id: string): Promise<WebhookRow | null> {
  const [row] = await sql<WebhookRow[]>`select * from webhooks where id = ${id} and clerk_user_id = ${userId}`;
  return row ?? null;
}

export async function getWebhook(sql: Sql, userId: string, id: string): Promise<Webhook | null> {
  const row = await getWebhookRow(sql, userId, id);
  return row ? toWebhook(row) : null;
}

/** True when the drop exists and belongs to the user. */
export async function ownsDrop(sql: Sql, userId: string, dropId: string): Promise<boolean> {
  const rows = await sql`select 1 from drops where id = ${dropId} and clerk_user_id = ${userId}`;
  return rows.length > 0;
}

/** Null when the account already holds WEBHOOKS_MAX. */
export async function createWebhook(sql: Sql, userId: string, req: CreateWebhookRequest): Promise<CreateWebhookResponse | null> {
  return sql.begin(async (tx) => {
    // Serializes concurrent creates for one user, so the limit holds.
    await tx`select pg_advisory_xact_lock(hashtext(${`webhooks:${userId}`}))`;
    const [count] = await tx<{ n: number }[]>`select count(*)::int as n from webhooks where clerk_user_id = ${userId}`;
    if ((count?.n ?? 0) >= WEBHOOKS_MAX) return null;
    const secret = newWebhookSecret();
    const [row] = await tx<WebhookRow[]>`
      insert into webhooks (clerk_user_id, url, secret, events, scope, drop_id)
      values (
        ${userId}, ${req.url}, ${secret}, ${[...new Set(req.events ?? WEBHOOK_EVENTS)]}::text[],
        ${req.dropId ? 'drops' : (req.scope ?? 'all')}, ${req.dropId ?? null}
      )
      returning *
    `;
    return { ...toWebhook(row!), secret };
  });
}

export async function updateWebhook(sql: Sql, userId: string, id: string, req: UpdateWebhookRequest): Promise<Webhook | null> {
  const set: Record<string, unknown> = {};
  if (req.url !== undefined) set.url = req.url;
  if (req.events !== undefined) set.events = [...new Set(req.events)];
  if (req.scope !== undefined) set.scope = req.scope;
  if (req.dropId !== undefined) set.drop_id = req.dropId;
  if (req.dropId) set.scope = 'drops';
  if (req.enabled !== undefined) {
    set.enabled = req.enabled;
    set.disabled_reason = null;
  }
  return sql.begin(async (tx) => {
    const [row] = await tx<WebhookRow[]>`
      update webhooks set ${tx(set)} where id = ${id} and clerk_user_id = ${userId} returning *
    `;
    if (!row) return null;
    // A paused webhook keeps no backlog: resuming starts from new events.
    if (!row.enabled) await tx`delete from webhook_deliveries where webhook_id = ${id} and status = 'pending'`;
    return toWebhook(row);
  });
}

export async function deleteWebhook(sql: Sql, userId: string, id: string): Promise<boolean> {
  const rows = await sql`delete from webhooks where id = ${id} and clerk_user_id = ${userId} returning id`;
  return rows.length > 0;
}

interface DeliveryRow {
  id: string;
  event: WebhookEvent;
  search_id: string;
  company_id: string | null;
  status: WebhookDeliveryStatus;
  attempts: number;
  last_status: number | null;
  last_error: string | null;
  created_at: Date;
  next_attempt_at: Date;
  delivered_at: Date | null;
}

export async function listDeliveries(sql: Sql, userId: string, webhookId: string, max = 50): Promise<WebhookDelivery[] | null> {
  if (!(await getWebhookRow(sql, userId, webhookId))) return null;
  const rows = await sql<DeliveryRow[]>`
    select id, event, search_id, company_id, status, attempts, last_status, last_error, created_at, next_attempt_at, delivered_at
    from webhook_deliveries where webhook_id = ${webhookId}
    order by created_at desc, id desc
    limit ${max}
  `;
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    searchId: r.search_id,
    companyId: r.company_id,
    status: r.status,
    attempts: r.attempts,
    lastStatus: r.last_status,
    lastError: r.last_error,
    createdAt: r.created_at.toISOString(),
    nextAttemptAt: r.status === 'pending' ? r.next_attempt_at.toISOString() : null,
    deliveredAt: iso(r.delivered_at),
  }));
}
