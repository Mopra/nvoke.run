// Suppression list: addresses and domains that must never be stored, served
// or exported again. Only sha256 hashes are kept (migration 0300_privacy).

import type { Sql, TransactionSql } from 'postgres';
import { sha256Hex } from '../auth/crypto.js';
import { registrableDomain } from './domain.js';

export type SuppressionSource = 'opt_out_page' | 'email' | 'bot_page' | 'admin';

export function addressHash(address: string): string {
  return sha256Hex(address.trim().toLowerCase());
}

export function domainHash(domain: string): string {
  return sha256Hex(`domain:${registrableDomain(domain.trim().toLowerCase())}`);
}

/** Hashes that suppress this address: the address itself and its domain. */
export function hashesForAddress(address: string): string[] {
  const at = address.lastIndexOf('@');
  const hashes = [addressHash(address)];
  if (at > 0) hashes.push(domainHash(address.slice(at + 1)));
  return hashes;
}

export async function isDomainSuppressed(sql: Sql, domain: string): Promise<boolean> {
  const rows = await sql`select 1 from suppressions where hash = ${domainHash(domain)} limit 1`;
  return rows.length > 0;
}

export async function isAddressSuppressed(sql: Sql, address: string): Promise<boolean> {
  const rows = await sql`select 1 from suppressions where hash in ${sql(hashesForAddress(address))} limit 1`;
  return rows.length > 0;
}

/** The subset of `addresses` that is suppressed, by address or by domain. */
export async function suppressedAddresses(sql: Sql, addresses: string[]): Promise<Set<string>> {
  if (addresses.length === 0) return new Set();
  const byHash = new Map<string, string[]>();
  for (const a of addresses) {
    for (const h of hashesForAddress(a)) byHash.set(h, [...(byHash.get(h) ?? []), a]);
  }
  const rows = await sql<{ hash: string }[]>`select hash from suppressions where hash in ${sql([...byHash.keys()])}`;
  return new Set(rows.flatMap((r) => byHash.get(r.hash) ?? []));
}

/**
 * Adds a hash to the suppression list and erases what is already stored for
 * it: the shared cache rows and every user's found addresses. Domain
 * suppression matches the registrable domain and its subdomains.
 */
export async function suppress(
  sql: Sql,
  target: { address: string } | { domain: string },
  source: SuppressionSource,
): Promise<void> {
  await sql.begin(async (tx) => {
    if ('address' in target) {
      const address = target.address.trim().toLowerCase();
      await tx`insert into suppressions (hash, kind, source) values (${addressHash(address)}, 'address', ${source}) on conflict do nothing`;
      await tx`delete from domain_emails where address = ${address}`;
      await tx`delete from emails where address = ${address}`;
      return;
    }
    const domain = registrableDomain(target.domain.trim().toLowerCase());
    await tx`insert into suppressions (hash, kind, source) values (${domainHash(domain)}, 'domain', ${source}) on conflict do nothing`;
    const sub = `%.${domain}`;
    // domain_emails rows go with their domain (on delete cascade).
    await tx`delete from domains where domain = ${domain} or domain like ${sub}`;
    await tx`
      delete from emails
      where split_part(address, '@', 2) = ${domain} or split_part(address, '@', 2) like ${sub}
    `;
  });
}

type Db = Sql | TransactionSql;

/**
 * SQL condition that is true when the address in `column` is suppressed,
 * by address hash or by the hash of any suffix of its domain (one of which
 * is the registrable domain the suppression was stored under). For use in
 * read queries, so an address suppressed after it was found stays hidden.
 * `column` must be a trusted identifier such as `e.address`.
 */
export function suppressedSql(sql: Db, column: string) {
  const col = sql.unsafe(column);
  return sql`exists (
    select 1 from suppressions s
    where s.hash = encode(sha256(convert_to(${col}, 'UTF8')), 'hex')
       or s.hash in (
         select encode(sha256(convert_to('domain:' || array_to_string(parts[i:], '.'), 'UTF8')), 'hex')
         from (select string_to_array(split_part(${col}, '@', 2), '.') as parts) p,
              generate_subscripts(p.parts, 1) as i
       )
  )`;
}

/** Why a sender may not write to an address again (send_suppressions, docs/sending/plan.md). */
export type SendSuppressionReason = 'unsubscribe' | 'bounce' | 'complaint' | 'manual';

/**
 * Records an objection to one sender. Unlike suppress() it erases nothing:
 * the address stays in other users' searches, only this user stops writing.
 */
export async function suppressForSender(sql: Db, userId: string, address: string, reason: SendSuppressionReason): Promise<void> {
  await sql`
    insert into send_suppressions (clerk_user_id, hash, reason)
    values (${userId}, ${addressHash(address)}, ${reason})
    on conflict do nothing`;
}

/**
 * SQL condition that is true when the user in `userColumn` may not write to
 * the address in `addressColumn` (send_suppressions). Both must be trusted
 * identifiers such as `l.clerk_user_id` and `l.address`.
 */
export function sendSuppressedSql(sql: Db, userColumn: string, addressColumn: string, domainColumn?: string) {
  const user = sql.unsafe(userColumn);
  const col = sql.unsafe(addressColumn);
  // A `domain:` hash (domainHash) blocks the whole company for this sender:
  // the owner's other outreach already wrote to it.
  const domain = domainColumn
    ? sql`or ss.hash = encode(sha256(convert_to('domain:' || ${sql.unsafe(domainColumn)}, 'UTF8')), 'hex')`
    : sql``;
  return sql`exists (
    select 1 from send_suppressions ss
    where ss.clerk_user_id = ${user}
      and (ss.hash = encode(sha256(convert_to(${col}, 'UTF8')), 'hex') ${domain})
  )`;
}

/** Like suppressedSql, for a bare domain column such as `c.domain`. */
export function domainSuppressedSql(sql: Db, column: string) {
  const col = sql.unsafe(column);
  return sql`exists (
    select 1 from suppressions s
    where s.hash in (
      select encode(sha256(convert_to('domain:' || array_to_string(parts[i:], '.'), 'UTF8')), 'hex')
      from (select string_to_array(${col}, '.') as parts) p,
           generate_subscripts(p.parts, 1) as i
    )
  )`;
}
