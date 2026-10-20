// One click unsubscribe (docs/sending/plan.md, RFC 8058). Every sent step
// carries `List-Unsubscribe: <{PUBLIC_API_URL}/u/{token}>`; the token is the
// messages row id with an HMAC under a key derived from SECRETS_KEY, so a
// link cannot be guessed or moved to another message. Using it is an
// objection to that sender only (send_suppressions), never a global erase.

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Sql } from 'postgres';
import type { Secrets } from '../crypto/secrets.js';
import { endLead } from './outcomes.js';
import { suppressForSender } from '../leads/suppression.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function mac(secrets: Secrets, id: string): Buffer {
  // 16 bytes is plenty against guessing and keeps the link short.
  return createHmac('sha256', secrets.derive('unsubscribe')).update(id).digest().subarray(0, 16);
}

export function signUnsubscribe(secrets: Secrets, messageRowId: string): string {
  const id = messageRowId.toLowerCase();
  return `${id}.${mac(secrets, id).toString('base64url')}`;
}

/** The messages row id the token was made for, or null when it is malformed or tampered with. */
export function readUnsubscribe(secrets: Secrets, token: string): string | null {
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const id = token.slice(0, dot).toLowerCase();
  if (!UUID.test(id)) return null;
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const want = mac(secrets, id);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return id;
}

/**
 * Stops the sender from writing to the recipient of this message again and
 * ends the lead as opted out. Idempotent: a second click changes nothing.
 * False when the message is unknown (retention may have dropped it).
 */
export async function unsubscribeByMessage(sql: Sql, messageRowId: string): Promise<boolean> {
  if (!UUID.test(messageRowId)) return false;
  return sql.begin(async (tx) => {
    const [m] = await tx<{ clerk_user_id: string; to_address: string; campaign_lead_id: string | null }[]>`
      select clerk_user_id, to_address, campaign_lead_id from messages
      where id = ${messageRowId} and direction = 'out'`;
    if (!m) return false;
    await suppressForSender(tx, m.clerk_user_id, m.to_address, 'unsubscribe');
    if (m.campaign_lead_id) await endLead(tx, m.campaign_lead_id, 'opted_out');
    return true;
  });
}
