import {
  CRAWL_MAX_PAGES,
  GUESSED_PATHS,
  extractEmails,
  hostToDomain,
  isPlatformDomain,
  pageWall,
  pickLikelyPages,
  selectForCompany,
  type ExtractedEmail,
} from '@nvoke/shared/crawl';
import { LOCAL_CRAWL_EMAILS_MAX, type LocalCrawlResultInput } from '@nvoke/shared';

/**
 * Reads one company site for the local render crawl: the homepage, then the
 * likely pages it links to, through a PageLoader (the hidden browser window
 * in browser.ts, a fake in tests). Same picking, extraction and own-domain
 * rule as the server crawl, from @nvoke/shared/crawl.
 */

export type PageLoad =
  /** `url` is where the page ended up after redirects; `html` is the rendered DOM. */
  | { kind: 'ok'; url: string; html: string }
  /** robots.txt disallows the page (or a redirect on the way). */
  | { kind: 'robots' }
  | { kind: 'error'; error: string };

export interface PageLoader {
  load(url: string): Promise<PageLoad>;
}

export type SiteRead = Omit<LocalCrawlResultInput, 'companyId'>;

export async function readSite(
  task: { website: string; domain: string },
  loader: PageLoader,
  maxPages = CRAWL_MAX_PAGES,
): Promise<SiteRead> {
  if (isPlatformDomain(task.domain)) return { outcome: 'blocked', emails: [], pages: 0 };

  let home = await loader.load(task.website);
  if (home.kind === 'error' && task.website.startsWith('https://')) {
    home = await loader.load(`http://${task.website.slice('https://'.length)}`);
  }
  if (home.kind === 'robots') return { outcome: 'blocked', emails: [], pages: 0 };
  if (home.kind === 'error') return { outcome: 'failed', emails: [], pages: 0 };
  // A login or a challenge is where we stop. Never typed into, never solved.
  if (pageWall(home.html)) return { outcome: 'blocked', emails: [], pages: 1 };

  let pages = 1;
  const found: ExtractedEmail[] = [...extractEmails(home.html, home.url)];
  let queue = pickLikelyPages(home.html, home.url, maxPages - 1);
  if (queue.length === 0) {
    const origin = new URL(home.url).origin;
    queue = GUESSED_PATHS.slice(0, Math.min(3, maxPages - 1)).map((p) => `${origin}${p}`);
  }

  const seen = new Set([task.website, home.url]);
  let attempts = 1;
  for (const url of queue) {
    if (attempts >= maxPages) break;
    if (seen.has(url)) continue;
    seen.add(url);
    const page = await loader.load(url);
    if (page.kind === 'robots') continue;
    attempts++;
    if (page.kind !== 'ok' || pageWall(page.html)) continue;
    pages++;
    found.push(...extractEmails(page.html, page.url));
  }

  // A homepage that redirects to a new brand domain makes that domain "own site" too.
  const landed = hostToDomain(new URL(home.url).hostname);
  const own = landed && landed !== task.domain ? [task.domain, landed] : [task.domain];
  const emails = selectForCompany(found, own)
    .slice(0, LOCAL_CRAWL_EMAILS_MAX)
    .map((e) => ({ address: e.address, sourceUrl: e.sourceUrl }));
  return { outcome: 'done', emails, pages };
}
