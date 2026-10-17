import {
  CRAWL_MAX_PAGES,
  clientRedirect,
  extractEmails,
  fallbackPages,
  homepageVariants,
  hostToDomain,
  isPlatformDomain,
  pageWall,
  planPages,
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

  // The address given, then plain http and the www twin, when one fails.
  let home: PageLoad = { kind: 'error', error: 'no homepage' };
  for (const url of homepageVariants(task.website)) {
    home = await loader.load(url);
    if (home.kind !== 'error') break;
  }
  if (home.kind === 'robots') return { outcome: 'blocked', emails: [], pages: 0 };
  if (home.kind === 'error') return { outcome: 'failed', emails: [], pages: 0 };
  // A login or a challenge is where we stop. Never typed into, never solved.
  if (pageWall(home.html)) return { outcome: 'blocked', emails: [], pages: 1 };

  let pages = 1;
  let attempts = 1;
  const found: ExtractedEmail[] = [...extractEmails(home.html, home.url)];
  // The browser follows a meta refresh by itself only when it gets the time; follow it here.
  const target = clientRedirect(home.html, home.url);
  if (target) {
    const next = await loader.load(target);
    attempts++;
    if (next.kind === 'ok' && !pageWall(next.html)) {
      pages++;
      home = next;
      found.push(...extractEmails(next.html, next.url));
    }
  }
  const homeUrl = home.url;
  const landed = hostToDomain(new URL(homeUrl).hostname);
  const own = landed && landed !== task.domain ? [task.domain, landed] : [task.domain];

  const seen = new Set([task.website, homeUrl]);
  const read = async (url: string): Promise<void> => {
    if (attempts >= maxPages || seen.has(url)) return;
    seen.add(url);
    const page = await loader.load(url);
    if (page.kind === 'robots') return;
    attempts++;
    if (page.kind !== 'ok' || pageWall(page.html)) return;
    pages++;
    found.push(...extractEmails(page.html, page.url));
  };
  for (const url of planPages(home.html, homeUrl, [], maxPages - 1)) await read(url);
  // Nothing on the linked pages: the usual contact paths, while pages are left.
  if (selectForCompany(found, own).length === 0) {
    for (const url of fallbackPages(homeUrl, seen, maxPages)) await read(url);
  }

  const emails = selectForCompany(found, own)
    .slice(0, LOCAL_CRAWL_EMAILS_MAX)
    .map((e) => ({ address: e.address, sourceUrl: e.sourceUrl }));
  return { outcome: 'done', emails, pages };
}
