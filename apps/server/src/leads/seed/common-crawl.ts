// Common Crawl as a source for the company index
// (docs/research/common-crawl-index.md). Reading a crawl's CDX index, picking
// each registrable domain's homepage and its best contact and about captures,
// and reading one WARC record by HTTP range from data.commoncrawl.org. The
// loader (cc-load.ts) writes what it reads into the index.
//
// The CDX index is sorted by SURT key, the host reversed ("com,example,www)/"),
// so every capture of one registrable domain sits in one run of lines: a shard
// or a block can be read as a stream, one domain at a time.

import { gunzipSync } from 'node:zlib';
import { pageScore, peoplePageKind } from '@nvoke/shared/crawl';
import { registrableDomain } from '../domain.js';

export const CC_DATA = 'https://data.commoncrawl.org/';
export const CC_USER_AGENT = 'nvokebot/1.0 (+https://nvoke.run/bot) company index';

export interface Capture {
  url: string;
  /** The capture time, 14 digits: 20261012083015. */
  timestamp: string;
  status: string;
  mime: string;
  filename: string;
  offset: number;
  length: number;
  redirect?: string;
}

/** One line of a CDX shard ("surt timestamp {json}"), or null when it is not one. */
export function parseCdxLine(line: string): Capture | null {
  const brace = line.indexOf('{');
  if (brace < 0) return null;
  try {
    const j = JSON.parse(line.slice(brace)) as Record<string, string>;
    const offset = Number(j.offset);
    const length = Number(j.length);
    if (!j.url || !j.filename || !Number.isFinite(offset) || !Number.isFinite(length)) return null;
    return {
      url: j.url,
      timestamp: line.slice(0, brace).trim().split(' ').at(-1) ?? '',
      status: j.status ?? '',
      mime: j['mime-detected'] ?? j.mime ?? '',
      filename: j.filename,
      offset,
      length,
      redirect: j.redirect,
    };
  } catch {
    return null;
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const HOME_PATHS = new Set(['/', '', '/index.html', '/index.htm', '/index.php', '/home', '/en', '/en/']);

export function isHome(url: string): boolean {
  try {
    const u = new URL(url);
    return HOME_PATHS.has(u.pathname) && !u.search;
  } catch {
    return false;
  }
}

export const isHtml200 = (c: Capture) => c.status === '200' && c.mime.includes('html');

function contactScore(url: string): number {
  try {
    const u = new URL(url);
    return peoplePageKind(u) ? 0 : pageScore(u);
  } catch {
    return 0;
  }
}

function aboutScore(url: string): number {
  try {
    const u = new URL(url);
    const kind = peoplePageKind(u);
    if (!kind) return 0;
    const depth = u.pathname.split('/').filter(Boolean).length;
    return (kind === 'team' ? 30 : kind === 'about' ? 25 : 20) - depth * 5 - (u.search ? 5 : 0);
  } catch {
    return 0;
  }
}

/** Where a page sits in the crawl: enough to fetch it by range. */
export interface CaptureRef {
  url: string;
  filename: string;
  offset: number;
  length: number;
  /** ISO time of the capture. */
  at: string;
}

/** One line of the load list: a domain with a readable homepage, and the best contact and about pages for a later pass. */
export interface ListedDomain {
  domain: string;
  home: CaptureRef;
  contact?: CaptureRef;
  about?: CaptureRef;
}

function ref(c: Capture): CaptureRef {
  const t = c.timestamp;
  const at = /^\d{14}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12, 14)}Z` : new Date(0).toISOString();
  return { url: c.url, filename: c.filename, offset: c.offset, length: c.length, at };
}

/**
 * The homepage and the best contact and about captures of one domain, or
 * null when the crawl holds no readable homepage: a 200 HTML capture of the
 * root on the bare or `www` host first, else the page a same site redirect of
 * the homepage points to, when that was captured too.
 */
export function pickPages(domain: string, caps: Capture[]): ListedDomain | null {
  const own = (c: Capture) => {
    const h = hostOf(c.url);
    return h === domain || h === `www.${domain}`;
  };
  const homes = caps.filter((c) => isHome(c.url));
  const pref = (c: Capture) => (own(c) ? 0 : 1) + (new URL(c.url).pathname === '/' ? 0 : 0.5);
  let home = homes.filter(isHtml200).sort((a, b) => pref(a) - pref(b))[0];
  if (!home) {
    // http to https, bare to www or / to /en/: the target is usually captured too.
    const target = homes.find((c) => c.status.startsWith('3') && c.redirect)?.redirect;
    const host = target ? hostOf(target) : null;
    if (target && host && registrableDomain(host) === domain) {
      const want = target.replace(/\/$/, '');
      home = caps.find((c) => isHtml200(c) && c.url.replace(/\/$/, '') === want);
    }
  }
  if (!home) return null;
  const top = (score: (u: string) => number, min: number) => {
    let best: Capture | undefined;
    let bestScore = min - 1;
    for (const c of caps) {
      if (!isHtml200(c) || c === home) continue;
      const s = score(c.url);
      if (s > bestScore) [best, bestScore] = [c, s];
    }
    return best;
  };
  const contact = top(contactScore, 50);
  const about = top(aboutScore, 1);
  return { domain, home: ref(home), ...(contact && { contact: ref(contact) }), ...(about && { about: ref(about) }) };
}

/** Captures held of one domain besides its homepages: a big site has millions. */
const MAX_GROUP = 2_000;

/**
 * The captures of a CDX stream grouped by registrable domain, in index
 * order. The index keeps a domain's captures together, so one group is held
 * at a time, and of it only the homepages and the first MAX_GROUP others. A
 * domain `skip` turns down comes with no captures.
 */
export async function* domainGroups(
  lines: AsyncIterable<string> | Iterable<string>,
  skip: (domain: string) => unknown = () => false,
): AsyncGenerator<{ domain: string; captures: Capture[] }> {
  let domain: string | null = null;
  let skipped = false;
  let captures: Capture[] = [];
  for await (const line of lines) {
    const c = parseCdxLine(line);
    const host = c && hostOf(c.url);
    if (!c || !host) continue;
    const d = registrableDomain(host);
    if (d !== domain) {
      if (domain) yield { domain, captures };
      domain = d;
      skipped = Boolean(skip(d));
      captures = [];
    }
    if (!skipped && (captures.length < MAX_GROUP || isHome(c.url))) captures.push(c);
  }
  if (domain) yield { domain, captures };
}

/** One block of the index from cluster.idx: "surt timestamp\tcdx-00150.gz\toffset\tlength\tid". */
export interface IndexBlock {
  shard: string;
  offset: number;
  length: number;
}

export function parseClusterLine(line: string): IndexBlock | null {
  const [, shard, offset, length] = line.split('\t');
  if (!shard || !offset || !length) return null;
  return { shard, offset: Number(offset), length: Number(length) };
}

/**
 * The HTML of one gzipped WARC response record, decoded by the charset its
 * HTTP header names. Null when the record is not an HTTP response with a body.
 */
export function warcHtml(gz: Buffer): string | null {
  const raw = gunzipSync(gz);
  const warcEnd = raw.indexOf('\r\n\r\n');
  const httpEnd = warcEnd < 0 ? -1 : raw.indexOf('\r\n\r\n', warcEnd + 4);
  if (httpEnd < 0) return null;
  const head = raw.subarray(warcEnd + 4, httpEnd).toString('latin1');
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  const body = raw.subarray(httpEnd + 4);
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}
