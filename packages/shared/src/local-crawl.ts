import { z } from 'zod';

/**
 * The desktop's local render crawl (docs/desktop/local-crawl.md): the
 * app claims refused and JS-only sites from the user's own searches, reads
 * them in a hidden browser window and sends back what it found. The server
 * checks every address again; verification and billing stay there.
 */

export const LOCAL_CRAWL_CLAIM_MAX = 5;

/**
 * Why the server crawl hands a company to the desktop: how that crawl ended
 * without an address. `refused` and `js_only` are what the local crawl was
 * built for; `done` is a site read with no address found, where a rendered
 * page sometimes shows one (docs/research/crawl-benchmark.md, step 7).
 * `failed` and `blocked` are not handed over: the desktop gained nothing on
 * them, and robots.txt answers it the same.
 */
export const LocalCrawlReason = z.enum(['refused', 'js_only', 'done']);
export type LocalCrawlReason = z.infer<typeof LocalCrawlReason>;
export const LOCAL_CRAWL_REASONS = LocalCrawlReason.options;
/** What a client that names no `reasons` is handed: desktop builds from before `done` read only these. */
export const LOCAL_CRAWL_LEGACY_REASONS: LocalCrawlReason[] = ['refused', 'js_only'];

/** Whether a company the server crawl ended `status` with `emails` addresses goes to the desktop. */
export function handsToLocalCrawl(status: string, emails: number): boolean {
  return emails === 0 && (LOCAL_CRAWL_REASONS as readonly string[]).includes(status);
}
export const LOCAL_CRAWL_EMAILS_MAX = 50;
export const LOCAL_CRAWL_PAGES_MAX = 8;

export const LocalCrawlClaimRequest = z.object({
  max: z.number().int().min(1).max(LOCAL_CRAWL_CLAIM_MAX).default(3),
  /** The outcomes the client reads. Refused and JS-only sites are handed out before `done` ones. */
  reasons: z
    .array(LocalCrawlReason)
    .min(1)
    .max(LOCAL_CRAWL_REASONS.length)
    .default(LOCAL_CRAWL_LEGACY_REASONS),
});
export type LocalCrawlClaimRequest = z.infer<typeof LocalCrawlClaimRequest>;

export const LocalCrawlTask = z.object({
  companyId: z.uuid(),
  searchId: z.uuid(),
  domain: z.string(),
  website: z.string(),
  /** Why the server crawl could not read it. */
  reason: LocalCrawlReason,
});
export type LocalCrawlTask = z.infer<typeof LocalCrawlTask>;

export const LocalCrawlClaimResponse = z.object({ tasks: z.array(LocalCrawlTask) });
export type LocalCrawlClaimResponse = z.infer<typeof LocalCrawlClaimResponse>;

export const LocalCrawlResultRequest = z.object({
  companyId: z.uuid(),
  /** `blocked`: robots.txt, a login or a challenge kept the app out. */
  outcome: z.enum(['done', 'failed', 'blocked']),
  emails: z
    .array(
      z.object({
        address: z.string().trim().min(3).max(254),
        sourceUrl: z.string().max(2000).nullable(),
      }),
    )
    .max(LOCAL_CRAWL_EMAILS_MAX)
    .default([]),
  pages: z.number().int().min(0).max(LOCAL_CRAWL_PAGES_MAX),
});
export type LocalCrawlResultRequest = z.infer<typeof LocalCrawlResultRequest>;
export type LocalCrawlResultInput = z.input<typeof LocalCrawlResultRequest>;

export const LocalCrawlResultResponse = z.object({
  /** Addresses that passed the server's checks and were queued for verification. */
  stored: z.number().int().nonnegative(),
});
export type LocalCrawlResultResponse = z.infer<typeof LocalCrawlResultResponse>;
