// The Common Crawl test behind docs/research/common-crawl-index.md: could
// the company index be built from Common Crawl's free archives rather than
// by crawling every company ourselves? Two measurements, no database, no
// paid API:
//
// - `shard <cdx-NNNNN.gz>` reads one of the crawl's 300 CDX index shards
//   (downloaded beforehand) and counts captures, hosts, registrable domains
//   and the domains with a readable homepage and a contact or about page.
//   Times 300 is the whole crawl.
// - `previous` checks the domains `sample` found no homepage for against an
//   older crawl's index: does stacking crawls fill the gap?
// - `sample` picks random blocks of the index across all 300 shards
//   (cluster.idx, 3,000 captures a block), takes a few domains from each and
//   fetches each one's homepage, best contact page and best about page by
//   HTTP range from data.commoncrawl.org. It writes one JSON line a domain:
//   title, description, the start of the text, the crawl rules' verdicts
//   (parked, JS only, wall) and the emails the shared extraction finds.
//   Claude then classifies those lines (business or not, does the head
//   support fit scoring), outside this script.
//
//   tsx --conditions=@nvoke/source src/bench/common-crawl.ts shard <cdx.gz>
//   tsx --conditions=@nvoke/source src/bench/common-crawl.ts sample --crawl CC-MAIN-2026-43 --cluster <cluster.idx> --blocks 800 --rate 0.02 --out <file.jsonl>
//   tsx --conditions=@nvoke/source src/bench/common-crawl.ts previous --crawl CC-MAIN-2026-39 --cluster <cluster.idx> --domains <file>

import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { gunzipSync, createGunzip } from 'node:zlib';
import {
  extractEmails,
  looksJsOnly,
  pageScore,
  pageWall,
  peoplePageKind,
  registrableDomain,
  sameSite,
  domainOf,
  selectForCompany,
} from '@nvoke/shared/crawl';
import { pageText } from '../leads/page-text.js';
import { seedSkipReason } from '../leads/seed/filter.js';
import { isParkedPage } from '../leads/sources/resolve-name.js';

const DATA = 'https://data.commoncrawl.org/';

interface Capture {
  url: string;
  status: string;
  mime: string;
  filename: string;
  offset: number;
  length: number;
  languages?: string;
  redirect?: string;
}

function parseLine(line: string): Capture | null {
  const brace = line.indexOf('{');
  if (brace < 0) return null;
  try {
    const j = JSON.parse(line.slice(brace)) as Record<string, string>;
    return {
      url: j.url ?? '',
      status: j.status ?? '',
      mime: j['mime-detected'] ?? j.mime ?? '',
      filename: j.filename ?? '',
      offset: Number(j.offset),
      length: Number(j.length),
      languages: j.languages,
      redirect: j.redirect,
    };
  } catch {
    return null;
  }
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const HOME_PATHS = new Set(['/', '', '/index.html', '/index.htm', '/index.php', '/home', '/en', '/en/']);

function isHome(url: string): boolean {
  try {
    const u = new URL(url);
    return HOME_PATHS.has(u.pathname) && !u.search;
  } catch {
    return false;
  }
}

const isHtml200 = (c: Capture) => c.status === '200' && c.mime.includes('html');

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

// ---------------------------------------------------------------------------
// shard

async function shard(path: string): Promise<void> {
  const started = Date.now();
  const stats = { lines: 0, html200: 0 };
  const hosts = new Set<string>();
  // Per registrable domain: bit 1 homepage 200 html, 2 contact page, 4 about page, 8 any 200 html.
  const domains = new Map<string, number>();
  const rl = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) {
    stats.lines++;
    const c = parseLine(line);
    if (!c) continue;
    const host = hostOf(c.url);
    if (!host) continue;
    hosts.add(host);
    const domain = registrableDomain(host);
    let flags = domains.get(domain) ?? 0;
    if (isHtml200(c)) {
      stats.html200++;
      flags |= 8;
      if (isHome(c.url)) flags |= 1;
      if (contactScore(c.url) >= 50) flags |= 2;
      if (aboutScore(c.url) > 0) flags |= 4;
    }
    domains.set(domain, flags);
  }
  let home = 0, contact = 0, about = 0, any = 0, homeAndPage = 0, seedable = 0, seedableHome = 0;
  for (const [domain, f] of domains) {
    if (f & 8) any++;
    if (f & 1) home++;
    if (f & 2) contact++;
    if (f & 4) about++;
    if (f & 1 && f & 6) homeAndPage++;
    if (!seedSkipReason(domain)) {
      seedable++;
      if (f & 1) seedableHome++;
    }
  }
  const out = {
    shard: path,
    seconds: Math.round((Date.now() - started) / 1000),
    captures: stats.lines,
    html200: stats.html200,
    hosts: hosts.size,
    domains: domains.size,
    domainsWithHtml: any,
    domainsWithHome: home,
    domainsWithContact: contact,
    domainsWithAbout: about,
    domainsWithHomeAndContactOrAbout: homeAndPage,
    domainsPassingSeedFilter: seedable,
    domainsPassingSeedFilterWithHome: seedableHome,
  };
  console.log(JSON.stringify(out, null, 2));
}

// ---------------------------------------------------------------------------
// sample

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let requests = 0;
let bytes = 0;
let retries = 0;

async function range(path: string, offset: number, length: number): Promise<Buffer> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(DATA + path, {
        headers: { Range: `bytes=${offset}-${offset + length - 1}`, 'User-Agent': 'nvokebot/1.0 (+https://nvoke.run/bot) research sample' },
        signal: AbortSignal.timeout(60_000),
      });
      if (res.status === 206 || res.status === 200) {
        const buf = Buffer.from(await res.arrayBuffer());
        requests++;
        bytes += buf.length;
        return buf;
      }
      if (attempt >= 6) throw new Error(`${res.status} for ${path}`);
    } catch (err) {
      if (attempt >= 6) throw err;
    }
    retries++;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
}

/** The HTML of one WARC response record, or null when it is not HTML. */
async function fetchRecord(c: Capture): Promise<string | null> {
  const raw = gunzipSync(await range(c.filename, c.offset, c.length));
  const warcEnd = raw.indexOf('\r\n\r\n');
  const httpEnd = raw.indexOf('\r\n\r\n', warcEnd + 4);
  if (warcEnd < 0 || httpEnd < 0) return null;
  const head = raw.subarray(warcEnd + 4, httpEnd).toString('latin1');
  const charset = /charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase();
  const body = raw.subarray(httpEnd + 4);
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

interface Picked {
  domain: string;
  home: Capture | null;
  homeStatus: string;
  contact: Capture | null;
  about: Capture | null;
  captures: number;
}

/** The homepage and the best contact and about pages among a domain's captures. */
function pick(domain: string, caps: Capture[]): Picked {
  const homes = caps.filter((c) => isHome(c.url));
  const best = (list: Capture[]) =>
    list.sort((a, b) => {
      const pref = (c: Capture) => (new URL(c.url).hostname === domain || new URL(c.url).hostname === `www.${domain}` ? 0 : 1) + (new URL(c.url).pathname === '/' ? 0 : 0.5);
      return pref(a) - pref(b);
    })[0] ?? null;
  let home = best(homes.filter(isHtml200));
  let homeStatus = home ? '200' : homes.length ? (homes.some((c) => c.status.startsWith('3')) ? 'redirect' : `status_${homes[0]!.status}`) : 'no_homepage_capture';
  if (!home && homeStatus === 'redirect') {
    const r = homes.find((c) => c.redirect)?.redirect;
    const target = r ? hostOf(r) : null;
    homeStatus = target && !sameSite(target, domain) ? 'redirect_elsewhere' : 'redirect_same_site';
    // http to https, bare to www or / to /en/: the target is usually captured too.
    const followed = r && homeStatus === 'redirect_same_site' ? caps.find((c) => isHtml200(c) && c.url.replace(/\/$/, '') === r.replace(/\/$/, '')) : undefined;
    if (followed) [home, homeStatus] = [followed, '200_after_redirect'];
  }
  const html = caps.filter(isHtml200);
  const top = (score: (u: string) => number, min: number) => {
    let bestCap: Capture | null = null;
    let bestScore = min - 1;
    for (const c of html) {
      const s = score(c.url);
      if (s > bestScore) [bestCap, bestScore] = [c, s];
    }
    return bestCap;
  };
  return { domain, home, homeStatus, contact: top(contactScore, 50), about: top(aboutScore, 1), captures: caps.length };
}

async function sample(args: Map<string, string>): Promise<void> {
  const crawl = args.get('crawl') ?? 'CC-MAIN-2026-43';
  const cluster = readFileSync(args.get('cluster') ?? 'cluster.idx', 'utf8').trim().split('\n');
  const blocks = Number(args.get('blocks') ?? 300);
  // Each domain in a block is taken at this rate, so the sample is uniform over domains, not over blocks.
  const rate = Number(args.get('rate') ?? 0.02);
  const out = args.get('out') ?? 'cc-sample.jsonl';
  // data.commoncrawl.org answered 403 to every request for a while after a run at 12 at once (86 a second).
  const concurrency = Number(args.get('concurrency') ?? 4);
  const rand = mulberry32(Number(args.get('seed') ?? 43));
  const started = Date.now();

  const chosen = new Set<number>();
  while (chosen.size < blocks) chosen.add(Math.floor(rand() * cluster.length));
  const picked: Picked[] = [];
  let domainsSeen = 0;
  let filtered = 0;
  await pool([...chosen], concurrency, async (i) => {
    const [, shardName, off, len] = cluster[i]!.split('\t');
    const text = gunzipSync(await range(`cc-index/collections/${crawl}/indexes/${shardName}`, Number(off), Number(len))).toString('utf8');
    const byDomain = new Map<string, Capture[]>();
    for (const line of text.split('\n')) {
      const c = parseLine(line);
      const host = c && hostOf(c.url);
      if (!c || !host) continue;
      const d = registrableDomain(host);
      const list = byDomain.get(d) ?? [];
      list.push(c);
      byDomain.set(d, list);
    }
    // The first and last domain of a block may continue in the next one.
    const names = [...byDomain.keys()].slice(1, -1);
    domainsSeen += names.length;
    const seedable = names.filter((d) => !seedSkipReason(d));
    filtered += names.length - seedable.length;
    for (const d of seedable) if (rand() < rate) picked.push(pick(d, byDomain.get(d)!));
  });
  console.error(`blocks ${blocks}, domains in them ${domainsSeen}, left out by the seed filter ${filtered}, sampled ${picked.length}`);

  const fetchStarted = Date.now();
  const rows = await pool(picked, concurrency, async (p) => {
    const pages: Array<{ kind: string; url: string; html: string | null }> = [];
    for (const [kind, cap] of [['home', p.home], ['contact', p.contact], ['about', p.about]] as const) {
      if (!cap) continue;
      try {
        pages.push({ kind, url: cap.url, html: await fetchRecord(cap) });
      } catch (err) {
        pages.push({ kind, url: cap.url, html: null });
        console.error(`${p.domain} ${kind}: ${(err as Error).message}`);
      }
    }
    const home = pages.find((x) => x.kind === 'home' && x.html);
    const head = home ? pageText(home.html!, home.url) : null;
    const found = pages.flatMap((x) => (x.html ? extractEmails(x.html, x.url) : []));
    const emails = selectForCompany(found, p.domain);
    return {
      domain: p.domain,
      captures: p.captures,
      homeStatus: p.homeStatus,
      pages: pages.map((x) => x.kind),
      lang: p.home?.languages ?? null,
      title: head?.title ?? null,
      description: head?.description ?? null,
      text: head?.text.slice(0, 600) ?? null,
      textLength: head?.text.length ?? 0,
      htmlLength: home?.html?.length ?? 0,
      parked: home ? isParkedPage(home.html!) : null,
      jsOnly: home ? looksJsOnly(home.html!) : null,
      wall: home ? pageWall(home.html!) : null,
      emails: emails.map((e) => e.address),
      ownEmails: emails.filter((e) => sameSite(domainOf(e.address), p.domain)).length,
      emailOnHome: home ? selectForCompany(extractEmails(home.html!, home.url), p.domain).length > 0 : false,
    };
  });
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const fetchSeconds = (Date.now() - fetchStarted) / 1000;
  console.log(
    JSON.stringify(
      {
        out,
        sampled: rows.length,
        seconds: Math.round((Date.now() - started) / 1000),
        fetchSeconds: Math.round(fetchSeconds),
        requests,
        retries,
        megabytes: Math.round(bytes / 1e6),
        requestsPerSecond: Math.round((requests / fetchSeconds) * 10) / 10,
      },
      null,
      2,
    ),
  );
}

// ---------------------------------------------------------------------------
// previous

/** The SURT key of a domain's homepage, as the CDX index sorts it ("www." is dropped). */
function surtHome(domain: string): string {
  return `${domain.replace(/^www\./, '').split('.').reverse().join(',')})/`;
}

/**
 * How many of the given domains (one per line, those the sample found no
 * homepage for) have a readable homepage in another crawl. Looks each one up
 * in that crawl's cluster.idx and reads the one or two blocks that hold it.
 */
async function previous(args: Map<string, string>): Promise<void> {
  const crawl = args.get('crawl') ?? 'CC-MAIN-2026-39';
  const cluster = readFileSync(args.get('cluster') ?? 'cluster.idx', 'utf8').trim().split('\n');
  const keys = cluster.map((l) => l.slice(0, l.indexOf(' ')));
  const domains = readFileSync(args.get('domains') ?? 'domains.txt', 'utf8').split('\n').map((d) => d.trim()).filter(Boolean);
  let found = 0;
  await pool(domains, 4, async (domain) => {
    const key = surtHome(domain);
    let lo = 0;
    let hi = keys.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (keys[mid]! <= key) lo = mid;
      else hi = mid - 1;
    }
    for (const i of [lo, lo + 1]) {
      const [, shardName, off, len] = cluster[i]?.split('\t') ?? [];
      if (!shardName) continue;
      const text = gunzipSync(await range(`cc-index/collections/${crawl}/indexes/${shardName}`, Number(off), Number(len))).toString('utf8');
      const hit = text.split('\n').some((line) => {
        if (!line.startsWith(key)) return false;
        const c = parseLine(line);
        return c !== null && isHtml200(c) && isHome(c.url);
      });
      if (hit) {
        found++;
        return;
      }
    }
  });
  console.log(JSON.stringify({ crawl, domains: domains.length, withHomepage: found, requests, retries }));
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < rest.length; i++) if (rest[i]!.startsWith('--')) flags.set(rest[i]!.slice(2), rest[++i] ?? '');
if (command === 'shard' && rest[0]) await shard(rest[0]);
else if (command === 'sample') await sample(flags);
else if (command === 'previous') await previous(flags);
else console.error('usage: common-crawl.ts shard <cdx.gz> | sample --cluster <cluster.idx> --blocks N --rate R --out <file>');
