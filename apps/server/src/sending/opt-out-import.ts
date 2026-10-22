// Opt-outs kept outside nvoke (the owner's earlier outreach for Day3 and
// exit1: a sent log, a do-not-contact list, drafts) brought in as per sender
// send_suppressions, so a campaign for that product never writes to them
// again (docs/sending/plan.md, "Own products").

import type { Sql } from 'postgres';
import { normalizeDomain, registrableDomain } from '../leads/domain.js';
import { suppressDomainForSender, suppressForSender } from '../leads/suppression.js';
import { parseCsv } from './import.js';

const ADDRESS = /^[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const ADDRESSES = /[a-z0-9._%+'-]+@[a-z0-9-]+(\.[a-z0-9-]+)+/gi;

export interface OptOuts {
  addresses: Set<string>;
  /** Bare domains: every address at them. */
  domains: Set<string>;
}

function isAddress(s: string): boolean {
  return ADDRESS.test(s.trim());
}

/** A bare domain such as "endress.com", or null. */
export function parseBareDomain(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(t)) return null;
  return normalizeDomain(t);
}

/**
 * Collects addresses and domains from files: .csv (every cell that is one
 * address), .txt (one per line, # starts a comment, a bare domain blocks
 * the domain) and .json (the `to` fields, and every other string that is
 * one address; `from` is the sender, never an opt-out).
 */
export function collectOptOuts(files: { name: string; text: string }[]): OptOuts {
  const out: OptOuts = { addresses: new Set(), domains: new Set() };
  const add = (s: string) => out.addresses.add(s.trim().toLowerCase());
  for (const { name, text } of files) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.csv')) {
      for (const row of parseCsv(text)) for (const cell of row) if (isAddress(cell)) add(cell);
    } else if (lower.endsWith('.json')) {
      const walk = (v: unknown, key: string | null): void => {
        if (typeof v === 'string') {
          if (key === 'to') for (const m of v.match(ADDRESSES) ?? []) add(m);
          else if (key !== 'from' && isAddress(v)) add(v);
        } else if (Array.isArray(v)) {
          for (const item of v) walk(item, key);
        } else if (v && typeof v === 'object') {
          for (const [k, item] of Object.entries(v)) walk(item, k);
        }
      };
      walk(JSON.parse(text) as unknown, null);
    } else {
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*$/, '').trim();
        if (!line) continue;
        if (isAddress(line)) add(line);
        else {
          const domain = parseBareDomain(line);
          if (domain) out.domains.add(domain);
        }
      }
    }
  }
  return out;
}

export interface OptOutCounts {
  addresses: number;
  domains: number;
  /** Rows that were not there before. */
  added: number;
}

/**
 * Stores the opt-outs for each sender (reason manual), and each of
 * `everyDomains` once for every sender of the user (''). Addresses at a
 * sender's own domain (the sending mailbox in a draft) are left out.
 * Idempotent: a row already there stays as it was.
 */
export async function importOptOuts(
  sql: Sql,
  userId: string,
  optOuts: OptOuts,
  senders: string[],
  everyDomains: string[] = [],
): Promise<Record<string, OptOutCounts>> {
  const own = new Set(senders.map((s) => registrableDomain(s.toLowerCase())));
  const addresses = [...optOuts.addresses].filter((a) => !own.has(registrableDomain(a.slice(a.lastIndexOf('@') + 1))));
  const domains = [...optOuts.domains].filter((d) => !own.has(registrableDomain(d)));
  const count = async (sender: string) => {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from send_suppressions where clerk_user_id = ${userId} and sender = ${sender}
    `;
    return row?.n ?? 0;
  };
  const result: Record<string, OptOutCounts> = {};
  for (const raw of senders) {
    const sender = raw.toLowerCase();
    const before = await count(sender);
    for (const a of addresses) await suppressForSender(sql, userId, a, 'manual', sender);
    for (const d of domains) await suppressDomainForSender(sql, userId, d, 'manual', sender);
    result[sender] = { addresses: addresses.length, domains: domains.length, added: (await count(sender)) - before };
  }
  if (everyDomains.length > 0) {
    const before = await count('');
    for (const d of everyDomains) await suppressDomainForSender(sql, userId, d, 'manual', '');
    result[''] = { addresses: 0, domains: everyDomains.length, added: (await count('')) - before };
  }
  return result;
}

