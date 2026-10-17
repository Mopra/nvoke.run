// Hiring signals for "Describe your customer" searches (docs/SPEC.md). A
// company that advertises a sales development, business development or
// account executive role is building an outbound team right now. Its job
// posts sit on the public boards of a few applicant tracking systems (Lever,
// Greenhouse, Ashby, Workable, Personio, Teamtailor, Recruitee), which Brave
// finds with `site:` queries. Each posting is mapped to the company's own
// site from its public board: the board's JSON where the system offers it
// without a login (Ashby's page data, Workable's account, Greenhouse's
// boards API), else the link to the company's site on the board page, else
// a guess from the board's name that the guessed homepage must confirm.
// Only public pages, fetched with the crawler's rules: robots.txt on every
// hop, the per host rate, a byte cap, no logins and no CAPTCHA solving.

import { load } from 'cheerio';
import { SiteFetcher, isHtml, type CrawlDeps } from './crawl.js';
import { isPlatformDomain, isWebmailDomain, normalizeDomain, pageWall, registrableDomain } from './domain.js';
import { decodeBody } from './http.js';
import { isDirectoryDomain, isSkippedHost } from './listicle.js';

export type Ats = 'lever' | 'greenhouse' | 'ashby' | 'workable' | 'personio' | 'teamtailor' | 'recruitee';

/** Display names, for the line fit scoring reads. */
export const ATS_NAMES: Record<Ats, string> = {
  lever: 'Lever',
  greenhouse: 'Greenhouse',
  ashby: 'Ashby',
  workable: 'Workable',
  personio: 'Personio',
  teamtailor: 'Teamtailor',
  recruitee: 'Recruitee',
};

/** The `site:` terms each system's public postings are found under. */
const ATS_SITES: Record<Ats, string[]> = {
  lever: ['jobs.lever.co'],
  greenhouse: ['job-boards.greenhouse.io', 'boards.greenhouse.io'],
  ashby: ['jobs.ashbyhq.com'],
  workable: ['apply.workable.com'],
  personio: ['jobs.personio.de', 'jobs.personio.com'],
  teamtailor: ['teamtailor.com'],
  recruitee: ['recruitee.com'],
};

/** Registrable domains of the systems, never a company of their own in a search. */
const ATS_DOMAINS = new Set([
  'lever.co', 'greenhouse.io', 'ashbyhq.com', 'workable.com', 'personio.de', 'personio.com', 'teamtailor.com',
  'recruitee.com', 'employinc.com', 'teamtailor-cdn.com', 'greenhouse.com', 'tellent.com', 'ashby.com',
]);
/** Sites a board links to that are never the company: review and job sites by label, any country. */
const NOT_COMPANY_LABEL = /^(glassdoor|indeed|kununu|welcometothejungle|builtin|wellfound|angel|otta|stepstone|monster)$/;

export function isAtsDomain(domain: string): boolean {
  return ATS_DOMAINS.has(registrableDomain(domain.toLowerCase()));
}

/** A company's board on one system. */
export interface AtsBoard {
  ats: Ats;
  /** The board's name on the system: "acme" in jobs.lever.co/acme. */
  slug: string;
  /** The board's public page. */
  board: string;
}

/** The board a job posting's address belongs to, or null when it is not on a known system. */
export function parseAtsUrl(raw: string): AtsBoard | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const first = decodeURIComponent(url.pathname.split('/').filter(Boolean)[0] ?? '').trim();
  const slugOk = (s: string) => /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,80}$/u.test(s);
  const sub = (suffix: string) => (host.endsWith(suffix) ? host.slice(0, -suffix.length).split('.')[0] ?? '' : '');
  if (host === 'jobs.lever.co' && slugOk(first)) return { ats: 'lever', slug: first, board: `https://jobs.lever.co/${encodeURIComponent(first)}` };
  if ((host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') && slugOk(first) && first !== 'embed') {
    return { ats: 'greenhouse', slug: first, board: `https://job-boards.greenhouse.io/${encodeURIComponent(first)}` };
  }
  if (host === 'jobs.ashbyhq.com' && slugOk(first) && first !== 'api') {
    return { ats: 'ashby', slug: first, board: `https://jobs.ashbyhq.com/${encodeURIComponent(first)}` };
  }
  if (host === 'apply.workable.com' && slugOk(first) && first !== 'api') {
    return { ats: 'workable', slug: first, board: `https://apply.workable.com/${encodeURIComponent(first)}/` };
  }
  for (const suffix of ['.jobs.personio.de', '.jobs.personio.com']) {
    const s = sub(suffix);
    if (s && slugOk(s)) return { ats: 'personio', slug: s, board: `https://${s}${suffix}/` };
  }
  const tt = sub('.teamtailor.com');
  if (tt && slugOk(tt) && !['www', 'app', 'career', 'careers', 'support', 'docs'].includes(tt)) {
    // Regional boards: acme.na.teamtailor.com.
    const region = host.slice(0, -'.teamtailor.com'.length).split('.').slice(1).join('.');
    return { ats: 'teamtailor', slug: tt, board: `https://${tt}${region ? `.${region}` : ''}.teamtailor.com/` };
  }
  const rc = sub('.recruitee.com');
  if (rc && slugOk(rc) && !['www', 'app', 'careers', 'support', 'docs'].includes(rc)) {
    return { ats: 'recruitee', slug: rc, board: `https://${rc}.recruitee.com/` };
  }
  return null;
}

/**
 * Job titles that mean a company sells by reaching out: sales and business
 * development, account executives, heads of sales, in the languages of the
 * boards nvoke searches.
 */
export const SALES_ROLE =
  /\b(sales development|business development (rep|representative|manager|executive)|s\.?d\.?r|b\.?d\.?r|account executive|head of (sales|growth|business development)|(vp|vice president|director)[ ,]+(of )?sales|sales (manager|lead|director|executive|representative|rep|specialist|consultant|associate)|founding (sales|ae|account executive|gtm)|inside sales|outbound|new business|business developer|lead generation|appointment setter|closer|vertrieb\w*|au(ss|ß)endienst|innendienst|neukunden\w*|key account|chargée? d'affaires|ventas|comercial|verkoop\w*|accountmanager|s(ä|a)lj\w*|salg\w*|myyj(ä|a)|myynti\w*)\b|\bae\b/i;

export function isSalesRole(title: string): boolean {
  return SALES_ROLE.test(title);
}

/** One job posting a search result points at. */
export interface HiringPosting extends AtsBoard {
  url: string;
  /** The role, from the result's title. */
  role: string;
  /** The company's name, from the result's title, when it says. */
  company?: string;
}

const clean = (s: string | undefined) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

/** The role and company in a posting's title, as each system writes it. */
export function splitPostingTitle(ats: Ats, rawTitle: string): { role: string; company?: string } {
  const title = clean(rawTitle).replace(/\s+[-|]\s+(Teamtailor|Recruitee)$/i, '');
  const at = (re: RegExp, roleIdx: number, companyIdx: number) => {
    const m = re.exec(title);
    return m ? { role: clean(m[roleIdx]), company: clean(m[companyIdx]) || undefined } : null;
  };
  let out: { role: string; company?: string } | null = null;
  switch (ats) {
    case 'lever':
    case 'recruitee':
      out = at(/^(.+?)\s+-\s+(.+)$/, 2, 1);
      break;
    case 'greenhouse':
      out = at(/^Job Application for (.+) at (.+)$/i, 1, 2);
      break;
    case 'ashby':
      out = at(/^(.+)\s+@\s+(.+)$/, 1, 2);
      break;
    case 'personio':
      out = at(/^(.+?)\s+\|\s+(?:Jobs|Stellenangebote|Karriere)\s+(?:at|bei|chez|en)\s+(.+)$/i, 1, 2);
      break;
    case 'workable':
    case 'teamtailor':
      out = at(/^(.+)\s+-\s+(.+?)$/, 1, 2);
      break;
  }
  return out ?? { role: title };
}

/** The posting a search result is, when it is on a known system and names a sales role. */
export function postingFromResult(url: string, title: string | undefined): HiringPosting | null {
  const board = parseAtsUrl(url);
  if (!board) return null;
  const { role, company } = splitPostingTitle(board.ats, title ?? '');
  // The title must name the role: a board's front page or another role is no signal.
  if (!isSalesRole(role)) return null;
  return { ...board, url, role: role.slice(0, 120), ...(company ? { company: company.slice(0, 100) } : {}) };
}

// Queries

/** Roles searched when the plan names none. */
export const DEFAULT_HIRING_ROLES = ['sales development representative', 'account executive', 'business development representative'];

/** Systems searched in a country: the ones its companies use most. */
export function atsFor(country: string | undefined): Ats[] {
  const base: Ats[] = ['lever', 'greenhouse', 'ashby', 'workable'];
  switch (country) {
    case 'de':
    case 'at':
    case 'ch':
      return ['personio', 'ashby', 'greenhouse', 'recruitee', 'lever'];
    case 'nl':
    case 'be':
      return ['recruitee', 'workable', 'teamtailor', 'greenhouse', 'lever'];
    case 'se':
    case 'dk':
    case 'no':
    case 'fi':
      return ['teamtailor', 'workable', 'greenhouse', 'lever', 'recruitee'];
    case 'gb':
    case 'ie':
    case 'fr':
    case 'es':
    case 'it':
    case 'pt':
    case 'pl':
      return [...base, 'teamtailor'];
    default:
      return base;
  }
}

/** One Brave query for a role on a set of systems: `"account executive" (site:jobs.lever.co OR ...)`. */
export function hiringQuery(role: string, ats: Ats[]): string {
  const sites = ats.flatMap((a) => ATS_SITES[a]).map((s) => `site:${s}`);
  return `"${role.replace(/"/g, '').trim()}" (${sites.join(' OR ')})`;
}

/**
 * Whether a description names customers that sell through their own team,
 * where a sales hire is the signal: sales teams, SDRs, founders, B2B
 * companies. Agencies that do outbound for clients are found by what they
 * say they do, not by their hiring.
 */
export function impliesSalesTeams(text: string): boolean {
  return /\b(sales teams?|in-house sales|sdrs?|bdrs?|account executives?|founders?|sales reps?|sales development reps?|b2b (companies|startups|saas|software companies))\b/i.test(text);
}

// Mapping a board to the company's own site

/** What a board says about its company. */
export interface BoardInfo {
  name?: string;
  website?: string;
  /** Open roles on the board, when they could be counted: a rough sign of size. */
  jobs?: number;
  /** Titles of the open sales roles on it, when they could be read. */
  salesRoles?: string[];
}

/** Bytes read of a board page or its JSON. */
const BOARD_MAX_BYTES = 1_500_000;

const LINK_NOISE = /\b(privacy|cookie|terms|datenschutz|legal notice|powered by)\b/i;

/** Lower case letters and digits only, for comparing names with domains. */
const squash = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(gmbh|ag|inc|llc|ltd|limited|bv|b\.v\.|sas|sa|ab|as|aps|oy|corp|corporation|group|careers|jobs|technologies|software|hq)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

/** Whether a domain plausibly belongs to a company with this name or board slug. */
export function domainMatches(domain: string, hints: string[]): boolean {
  const label = squash(registrableDomain(domain).split('.')[0] ?? '');
  if (label.length < 3) return false;
  return hints.some((h) => {
    const s = squash(h.replace(/-\d+$/, ''));
    return s.length >= 3 && (label.includes(s) || s.includes(label));
  });
}

/** Whether a link's site can be a company's own site, not the system, a platform or a tracker. */
function companySite(domain: string): boolean {
  if (NOT_COMPANY_LABEL.test(registrableDomain(domain).split('.')[0] ?? '')) return false;
  return !(isAtsDomain(domain) || isSkippedHost(domain) || isPlatformDomain(domain) || isDirectoryDomain(domain) || isWebmailDomain(domain));
}

/**
 * The company's own site among a board page's links: the site linked most,
 * weighted up for a logo link, a "home page" or imprint link and a name that
 * matches the board. Null when no link leaves the system.
 */
export function pickWebsite(html: string, pageUrl: string, hints: string[]): string | null {
  const $ = load(html);
  const scores = new Map<string, { score: number; origin: string }>();
  $('a[href]').each((_i, el) => {
    const a = $(el);
    let url: URL;
    try {
      url = new URL(a.attr('href') ?? '', pageUrl);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    const domain = normalizeDomain(url.toString());
    if (!domain || !companySite(domain)) return;
    const text = clean(a.text());
    const site = registrableDomain(domain);
    let score = LINK_NOISE.test(text) ? 0.5 : 1;
    if (a.find('img, svg').length > 0 || /logo/i.test(a.attr('class') ?? '')) score += 3;
    if (/\b(home ?page|website|webseite|site web|imprint|impressum|about us|über uns)\b/i.test(text)) score += 2;
    if (domainMatches(domain, hints)) score += 3;
    const prev = scores.get(site);
    scores.set(site, { score: (prev?.score ?? 0) + score, origin: prev?.origin ?? `https://${domain}` });
  });
  const best = [...scores.values()].sort((a, b) => b.score - a.score)[0];
  // A lone link that neither looks like a logo nor matches the board's name is more likely a partner or a cookie vendor.
  return best && best.score >= 2 ? best.origin : null;
}

/** Counts and sales role titles from a list of job titles. */
function rolesOf(titles: string[]): Pick<BoardInfo, 'jobs' | 'salesRoles'> {
  return { jobs: titles.length, salesRoles: [...new Set(titles.filter(isSalesRole).map((t) => clean(t).slice(0, 80)))].slice(0, 6) };
}

async function fetchText(url: string, deps: CrawlDeps, signal?: AbortSignal): Promise<{ text: string; url: string } | null> {
  const fetcher = new SiteFetcher(deps, BOARD_MAX_BYTES, signal);
  const page = await fetcher.get(url);
  if (page.kind !== 'ok' || page.status < 200 || page.status >= 300) return null;
  return { text: decodeBody(page.body, page.contentType), url: page.url };
}

async function fetchJson<T>(url: string, deps: CrawlDeps, signal?: AbortSignal): Promise<T | null> {
  const page = await fetchText(url, deps, signal);
  if (!page) return null;
  try {
    return JSON.parse(page.text) as T;
  } catch {
    return null;
  }
}

/** Job titles linked from a server rendered board page, by the path a posting has on that system. */
function boardTitles(html: string, ats: Ats): string[] {
  const path: Record<Ats, RegExp> = {
    lever: /^https:\/\/jobs\.lever\.co\/[^/]+\/[0-9a-f-]{20,}/i,
    greenhouse: /\/jobs\/\d+/,
    ashby: /^$/,
    workable: /\/j\/[0-9A-F]{6,}/i,
    personio: /\/job\/\d+/,
    teamtailor: /\/jobs\/\d+/,
    recruitee: /\/o\/[^/]+/,
  };
  const $ = load(html);
  const titles = new Map<string, { text: string; heading: boolean }>();
  $('a[href]').each((_i, el) => {
    const a = $(el);
    const href = a.attr('href') ?? '';
    if (!path[ats].test(href)) return;
    const key = href.split('?')[0]!;
    const heading = clean(a.find('h2, h3, h4, h5, [data-qa="posting-name"], .title').first().text());
    // A posting is linked from its title and from buttons ("Apply"): the heading wins, else the longest text.
    const text = heading || clean(a.text()).slice(0, 120);
    const prev = titles.get(key);
    if (!prev || (heading && !prev.heading) || (!prev.heading && text.length > prev.text.length)) titles.set(key, { text, heading: !!heading });
  });
  return [...titles.values()].map((t) => t.text).filter(Boolean);
}

/** A homepage's title and site name, and whether it links to the board: read to confirm a guessed domain. */
async function readGuess(url: string, board: string | undefined, deps: CrawlDeps, signal?: AbortSignal): Promise<{ name: string; linksBoard: boolean } | null> {
  const fetcher = new SiteFetcher(deps, 250_000, signal);
  const page = await fetcher.get(url);
  if (page.kind !== 'ok' || page.status < 200 || page.status >= 300 || !isHtml(page.contentType)) return null;
  const html = decodeBody(page.body, page.contentType);
  if (pageWall(html)) return null;
  const $ = load(html);
  const bare = (u: string) => u.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
  const target = board ? bare(board) : null;
  const linksBoard =
    !!target &&
    $('a[href]')
      .toArray()
      .some((el) => {
        const href = bare($(el).attr('href') ?? '');
        return href === target || href.startsWith(`${target}/`) || href.startsWith(`${target}?`);
      });
  return { name: [$('title').first().text(), $('meta[property="og:site_name"]').attr('content') ?? ''].map(clean).join(' '), linksBoard };
}

/** Shortest company name a guessed domain is trusted on by its homepage title alone: "pilot.com" could be anyone. */
export const MIN_GUESS_NAME = 6;

/**
 * A guess at the company's site from its name and board slug ("tailscale"
 * gives tailscale.com, .io, .ai). Kept when the homepage links back to the
 * company's board, or when the name is at least MIN_GUESS_NAME letters, the
 * domain's label is exactly the name and the homepage title names it. At
 * most three homepages are read.
 */
export async function guessWebsite(
  name: string | undefined,
  slug: string,
  deps: CrawlDeps,
  signal?: AbortSignal,
  board?: string,
): Promise<string | null> {
  const wanted = squash(name ?? slug);
  const bases = [...new Set([squash(slug.replace(/-\d+$/, '')), name ? wanted : ''].filter((b) => b.length >= 3 && b.length <= 30))];
  const tries = bases.flatMap((b) => ['com', 'io', 'ai'].map((tld) => ({ url: `https://${b}.${tld}`, base: b }))).slice(0, 3);
  for (const { url, base } of tries) {
    if (signal?.aborted) return null;
    const got = await readGuess(url, board, deps, signal).catch(() => null);
    if (!got) continue;
    if (got.linksBoard) return url;
    if (base === wanted && wanted.length >= MIN_GUESS_NAME && squash(got.name).includes(wanted)) return url;
  }
  return null;
}

interface AshbyData {
  organization?: { name?: string; publicWebsite?: string | null };
  jobBoard?: { jobPostings?: { title?: string }[] };
}

/** What a company's board says about it: its name, its own site and its open roles. Null when nothing could be read. */
export async function readBoard(board: AtsBoard, hints: string[], deps: CrawlDeps, signal?: AbortSignal): Promise<BoardInfo | null> {
  const allHints = [board.slug, ...hints];
  switch (board.ats) {
    case 'ashby': {
      const page = await fetchText(board.board, deps, signal);
      const m = page && /window\.__appData\s*=\s*(\{.*?\});\s*<\/script>/s.exec(page.text);
      if (!m) return null;
      let data: AshbyData;
      try {
        data = JSON.parse(m[1]!) as AshbyData;
      } catch {
        return null;
      }
      const site = data.organization?.publicWebsite ?? undefined;
      return {
        name: data.organization?.name,
        website: site && companySite(normalizeDomain(site) ?? '') ? site : undefined,
        ...rolesOf((data.jobBoard?.jobPostings ?? []).map((p) => p.title ?? '').filter(Boolean)),
      };
    }
    case 'workable': {
      const account = await fetchJson<{ name?: string; url?: string }>(`https://apply.workable.com/api/v1/accounts/${encodeURIComponent(board.slug)}`, deps, signal);
      if (!account) return null;
      const site = account.url && companySite(normalizeDomain(account.url) ?? '') ? new URL(account.url).origin : undefined;
      return { name: account.name, website: site };
    }
    case 'greenhouse': {
      const api = await fetchJson<{ jobs?: { title?: string; absolute_url?: string; company_name?: string }[] }>(
        `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board.slug)}/jobs`,
        deps,
        signal,
      );
      const jobs = api?.jobs ?? [];
      const name = jobs.find((j) => j.company_name)?.company_name;
      // Boards embedded on the company's own careers page link postings there.
      const own = jobs.map((j) => (j.absolute_url ? normalizeDomain(j.absolute_url) : null)).find((d): d is string => !!d && companySite(d));
      let website = own ? `https://${own}` : undefined;
      if (!website) {
        const page = await fetchText(board.board, deps, signal);
        website = (page && pickWebsite(page.text, page.url, name ? [...allHints, name] : allHints)) || undefined;
      }
      if (!api && !website) return null;
      return { name, website, ...(api ? rolesOf(jobs.map((j) => j.title ?? '')) : {}) };
    }
    default: {
      const page = await fetchText(board.board, deps, signal);
      if (!page || pageWall(page.text)) return null;
      const titles = boardTitles(page.text, board.ats);
      return { website: pickWebsite(page.text, page.url, allHints) ?? undefined, ...(titles.length ? rolesOf(titles) : {}) };
    }
  }
}

/** A posting mapped to its company: the company's own site, its name and what the board says. */
export interface HiringCompany {
  name: string;
  website: string;
  /** Whether the site was guessed from the board's name rather than read from the board. */
  guessed?: boolean;
  posting: HiringPosting;
  board: BoardInfo;
}

/** Pretty name from a board slug: "luxury-presence" gives "Luxury Presence". */
function slugName(slug: string): string {
  return slug
    .replace(/-\d+$/, '')
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Maps a posting to the company's own site, or null when its board does not say and no guess is confirmed. */
export async function resolvePosting(posting: HiringPosting, deps: CrawlDeps, signal?: AbortSignal): Promise<HiringCompany | null> {
  const hints = posting.company ? [posting.company] : [];
  const board = (await readBoard(posting, hints, deps, signal).catch((err: unknown) => {
    if (signal?.aborted) throw err;
    return null;
  })) ?? {};
  const name = board.name || posting.company || slugName(posting.slug);
  const guess = board.website ? null : await guessWebsite(name, posting.slug, deps, signal, posting.board).catch(() => null);
  const found = board.website ?? guess;
  const domain = found ? normalizeDomain(found) : null;
  if (!domain) return null;
  // A careers subdomain stands for the company's site.
  const host = /^(careers|career|jobs|join|work|karriere)\./i.test(domain) ? registrableDomain(domain) : domain;
  return { name, website: `https://${host}`, posting, board, ...(guess ? { guessed: true } : {}) };
}

/** The line fit scoring reads about a hiring candidate. */
export function hiringSnippet(c: HiringCompany): string {
  const parts = [`Job post on ${ATS_NAMES[c.posting.ats]}: "${c.posting.role}".`];
  const others = (c.board.salesRoles ?? []).filter((r) => r.toLowerCase() !== c.posting.role.toLowerCase());
  if (c.board.salesRoles) {
    parts.push(
      c.board.salesRoles.length > 0
        ? `Open sales roles on its board: ${[c.posting.role, ...others].slice(0, 4).join('; ')}.`
        : 'The role is no longer listed on its board.',
    );
  }
  if (typeof c.board.jobs === 'number') parts.push(`${c.board.jobs} open roles in all${c.board.jobs >= 60 ? ' (a large company)' : ''}.`);
  if (c.guessed) parts.push('The site was matched to the job board by name, not by a link.');
  return parts.join(' ');
}
