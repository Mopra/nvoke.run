// The free SPF and DMARC checker (POST /v1/tools/email-auth). DNS only:
// MX, the SPF record and its lookup count (includes followed, RFC 7208 caps
// it at 10), the DMARC policy, and DKIM keys under the selectors most mail
// providers use. Each part is graded pass, warn or fail.

import { Resolver } from 'node:dns/promises';
import type { ToolEmailAuthResponse } from '@nvoke/shared';
import { lookupMx, type DnsLike } from '../leads/verify/mx.js';

export interface AuthDns extends DnsLike {
  resolveTxt(name: string): Promise<string[][]>;
}

export function systemAuthDns(timeoutMs = 4_000): AuthDns {
  return new Resolver({ timeout: timeoutMs, tries: 2 });
}

/** Selectors of Google Workspace, Microsoft 365, Mailchimp, SendGrid, Amazon SES, Zoho and common defaults. */
export const DKIM_SELECTORS = [
  'google', 'selector1', 'selector2', 'k1', 'k2', 's1', 's2', 'default', 'dkim', 'mail', 'smtp', 'mx', 'zoho', 'mandrill', 'everlytickey1',
];

/** SPF allows at most 10 DNS lookups; past that receivers answer permerror. */
const SPF_LOOKUP_LIMIT = 10;
/** Stops a looping or enormous include tree. */
const SPF_MAX_RECORDS = 25;

async function txt(dns: AuthDns, name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(''));
  } catch {
    return [];
  }
}

function spfRecords(records: string[]): string[] {
  return records.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));
}

/** DNS lookups an SPF record costs, following include and redirect. */
async function countSpfLookups(dns: AuthDns, record: string, seen: Set<string>): Promise<number> {
  let count = 0;
  for (const term of record.trim().split(/\s+/).slice(1)) {
    const t = term.toLowerCase().replace(/^[+\-~?]/, '');
    const include = t.match(/^include:(.+)$/) ?? t.match(/^redirect=(.+)$/);
    if (include) {
      count++;
      const target = include[1]!;
      if (seen.has(target) || seen.size >= SPF_MAX_RECORDS) continue;
      seen.add(target);
      const child = spfRecords(await txt(dns, target))[0];
      if (child) count += await countSpfLookups(dns, child, seen);
      continue;
    }
    if (/^(a|mx|ptr)([:/]|$)/.test(t) || t.startsWith('exists:')) count++;
  }
  return count;
}

type Grade = 'pass' | 'warn' | 'fail';

export async function checkEmailAuth(domain: string, dns: AuthDns = systemAuthDns()): Promise<ToolEmailAuthResponse> {
  const [mx, spf, dmarc, dkim] = await Promise.all([checkMx(domain, dns), checkSpf(domain, dns), checkDmarc(domain, dns), checkDkim(domain, dns)]);
  return { domain, mx, spf, dmarc, dkim };
}

async function checkMx(domain: string, dns: AuthDns): Promise<ToolEmailAuthResponse['mx']> {
  const mx = await lookupMx(domain, dns);
  if (mx.kind === 'ok') {
    return mx.implicit
      ? { grade: 'warn', hosts: mx.hosts, notes: ['No MX records. Mail falls back to the domain’s own address, which most senders treat as a sign of a misconfigured domain.'] }
      : { grade: 'pass', hosts: mx.hosts, notes: [] };
  }
  if (mx.kind === 'null_mx') return { grade: 'fail', hosts: [], notes: ['A null MX record says this domain accepts no mail.'] };
  if (mx.kind === 'error') return { grade: 'warn', hosts: [], notes: ['The DNS lookup failed. Try again in a minute.'] };
  return { grade: 'fail', hosts: [], notes: ['No MX records and no address: this domain cannot receive mail.'] };
}

async function checkSpf(domain: string, dns: AuthDns): Promise<ToolEmailAuthResponse['spf']> {
  const records = spfRecords(await txt(dns, domain));
  if (records.length === 0) {
    return { grade: 'fail', record: null, all: null, lookups: 0, notes: ['No SPF record. Anyone can send mail as this domain, and receivers trust it less.'] };
  }
  const record = records[0]!;
  const notes: string[] = [];
  let grade: Grade = 'pass';
  const worst = (g: Grade) => {
    if (g === 'fail' || (g === 'warn' && grade === 'pass')) grade = g;
  };
  if (records.length > 1) {
    notes.push(`${records.length} SPF records. There must be exactly one, or receivers ignore all of them.`);
    worst('fail');
  }
  const allTerm = record.trim().split(/\s+/).find((t) => /^[+\-~?]?all$/i.test(t)) ?? null;
  const all = allTerm ? (/^[+\-~?]/.test(allTerm) ? allTerm.toLowerCase() : `+${allTerm.toLowerCase()}`) : null;
  const redirect = /\sredirect=/i.test(record);
  if (all === '+all') {
    notes.push('+all lets every server on the internet send as this domain. Use -all or ~all.');
    worst('fail');
  } else if (all === '?all') {
    notes.push('?all is neutral: receivers learn nothing from the record. Use -all or ~all.');
    worst('warn');
  } else if (all === null && !redirect) {
    notes.push('No all term at the end, so mail from unlisted servers is not flagged. End the record with -all or ~all.');
    worst('warn');
  } else if (all === '~all') {
    notes.push('~all soft fails unlisted servers. Fine for most domains; -all is stricter.');
  }
  if (/(^|\s)[+]?ptr(\s|:|$)/i.test(record)) {
    notes.push('The ptr mechanism is deprecated and slow. Remove it.');
    worst('warn');
  }
  const lookups = await countSpfLookups(dns, record, new Set([domain]));
  if (lookups > SPF_LOOKUP_LIMIT) {
    notes.push(`${lookups} DNS lookups. The limit is ${SPF_LOOKUP_LIMIT}, past it SPF fails for every message. Flatten or drop includes.`);
    worst('fail');
  } else if (lookups >= 8) {
    notes.push(`${lookups} of ${SPF_LOOKUP_LIMIT} DNS lookups used. One more provider and SPF breaks.`);
    worst('warn');
  }
  return { grade, record, all, lookups, notes };
}

function dmarcTags(record: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const part of record.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
  }
  return tags;
}

async function checkDmarc(domain: string, dns: AuthDns): Promise<ToolEmailAuthResponse['dmarc']> {
  const records = (await txt(dns, `_dmarc.${domain}`)).filter((r) => /^v=DMARC1\s*(;|$)/i.test(r.trim()));
  if (records.length === 0) {
    return { grade: 'fail', record: null, policy: null, notes: ['No DMARC record. Gmail and Yahoo require one from bulk senders, and spoofed mail goes unchecked.'] };
  }
  const record = records[0]!;
  const notes: string[] = [];
  let grade: Grade = 'pass';
  if (records.length > 1) {
    notes.push(`${records.length} DMARC records. There must be exactly one, or receivers ignore all of them.`);
    grade = 'fail';
  }
  const tags = dmarcTags(record);
  const p = tags.get('p')?.toLowerCase();
  const policy = p === 'none' || p === 'quarantine' || p === 'reject' ? p : null;
  if (!policy) {
    notes.push('The p tag is missing or invalid, so the record is ignored.');
    grade = 'fail';
  } else if (policy === 'none') {
    notes.push('p=none only monitors. Spoofed mail still lands. Move to quarantine, then reject.');
    if (grade === 'pass') grade = 'warn';
  }
  if (!tags.has('rua')) notes.push('No rua address, so nobody receives the aggregate reports.');
  const pct = tags.get('pct');
  if (pct && Number(pct) < 100 && policy && policy !== 'none') {
    notes.push(`pct=${pct}: the policy applies to only ${pct}% of failing mail.`);
    if (grade === 'pass') grade = 'warn';
  }
  return { grade, record, policy, notes };
}

async function checkDkim(domain: string, dns: AuthDns): Promise<ToolEmailAuthResponse['dkim']> {
  const found = await Promise.all(
    DKIM_SELECTORS.map(async (s) => {
      const records = await txt(dns, `${s}._domainkey.${domain}`);
      return records.some((r) => /(^|;)\s*(v=DKIM1|k=rsa|k=ed25519|p=)/i.test(r)) ? s : null;
    }),
  );
  const selectors = found.filter((s): s is string => s !== null);
  if (selectors.length > 0) return { grade: 'pass', selectors, notes: [] };
  return {
    grade: 'warn',
    selectors,
    notes: ['No DKIM key under the common selectors. Your provider may use its own selector: check a sent message’s DKIM-Signature header (s=).'],
  };
}
