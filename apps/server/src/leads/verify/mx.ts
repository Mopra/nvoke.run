import { Resolver } from 'node:dns/promises';

export type MxLookup =
  | { kind: 'ok'; hosts: string[]; implicit: boolean }
  /** The domain does not exist, or has neither MX nor A/AAAA records. */
  | { kind: 'none' }
  /** RFC 7505 null MX: the domain explicitly accepts no mail. */
  | { kind: 'null_mx' }
  /** Resolver trouble. Not evidence either way. */
  | { kind: 'error'; message: string };

export interface DnsLike {
  resolveMx(domain: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolve4(domain: string): Promise<string[]>;
  resolve6(domain: string): Promise<string[]>;
}

export function systemDns(timeoutMs = 5_000): DnsLike {
  return new Resolver({ timeout: timeoutMs, tries: 2 });
}

const NOT_FOUND = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

function code(err: unknown): string {
  return typeof err === 'object' && err && 'code' in err ? String((err as { code: unknown }).code) : '';
}

/** MX hosts by priority, falling back to the domain itself when it has an address (RFC 5321 implicit MX). */
export async function lookupMx(domain: string, dns: DnsLike): Promise<MxLookup> {
  try {
    const records = await dns.resolveMx(domain);
    if (records.length === 1 && (records[0]?.exchange === '' || records[0]?.exchange === '.')) return { kind: 'null_mx' };
    const hosts = records
      .filter((r) => r.exchange && r.exchange !== '.')
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.toLowerCase().replace(/\.$/, ''));
    if (hosts.length > 0) return { kind: 'ok', hosts: [...new Set(hosts)], implicit: false };
  } catch (err) {
    if (!NOT_FOUND.has(code(err))) return { kind: 'error', message: `${code(err) || 'dns'}: MX lookup failed` };
    if (code(err) === 'ENOTFOUND') return { kind: 'none' };
  }
  // No MX records: an A or AAAA record makes the domain itself the mail host.
  for (const resolve of [dns.resolve4.bind(dns), dns.resolve6.bind(dns)]) {
    try {
      const addrs = await resolve(domain);
      if (addrs.length > 0) return { kind: 'ok', hosts: [domain], implicit: true };
    } catch (err) {
      if (!NOT_FOUND.has(code(err))) return { kind: 'error', message: `${code(err) || 'dns'}: address lookup failed` };
    }
  }
  return { kind: 'none' };
}
