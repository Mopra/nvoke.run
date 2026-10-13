import { LocalCrawlClaimResponse, type LocalCrawlTask } from '@nvoke/shared';
import { readSite, type PageLoader } from './reader';

/**
 * The local render crawl (docs/SPEC.md): while the computer is idle or
 * locked, on power, signed in and opted in, claim refused and JS-only
 * companies from the user's own searches one at a time, read them in the
 * hidden window and send back what was found. Verification and billing stay
 * on the server.
 */

/** How often the crawler looks for work. */
export const CHECK_EVERY_MS = 2 * 60_000;
/** Seconds without input before the computer counts as idle. */
export const IDLE_AFTER_S = 120;
/** At most this many companies per idle stretch check, so a long night stays modest. */
export const MAX_PER_ROUND = 20;

export type IdleState = 'active' | 'idle' | 'locked' | 'unknown';

export interface WorkConditions {
  enabled: boolean;
  signedIn: boolean;
  onBattery: boolean;
  idleState: IdleState;
}

/** Whether the crawler may work right now. */
export function mayWork(c: WorkConditions): boolean {
  return c.enabled && c.signedIn && !c.onBattery && (c.idleState === 'idle' || c.idleState === 'locked');
}

export interface LocalCrawlerDeps {
  /** apps/server through the device session (AuthSession.api). */
  api(path: string, init?: RequestInit): Promise<Response>;
  conditions(): WorkConditions;
  /** The hidden browser, made on first use. */
  browser(): PageLoader & { reset(): Promise<void> };
  log?: (message: string) => void;
}

export class LocalCrawler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly deps: LocalCrawlerDeps) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), CHECK_EVERY_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One round: work while the conditions hold, up to MAX_PER_ROUND companies. Returns how many were read. */
  async tick(): Promise<number> {
    if (this.running || !mayWork(this.deps.conditions())) return 0;
    this.running = true;
    let read = 0;
    try {
      while (read < MAX_PER_ROUND && mayWork(this.deps.conditions())) {
        const task = await this.claim();
        if (!task) break;
        await this.crawl(task);
        read++;
      }
    } catch (err) {
      this.deps.log?.(`local crawl stopped: ${String(err)}`);
    } finally {
      this.running = false;
    }
    return read;
  }

  private async claim(): Promise<LocalCrawlTask | null> {
    const res = await this.deps.api('/v1/local-crawl/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ max: 1 }),
    });
    if (!res.ok) return null;
    const parsed = LocalCrawlClaimResponse.safeParse(await res.json());
    return parsed.success ? (parsed.data.tasks[0] ?? null) : null;
  }

  private async crawl(task: LocalCrawlTask): Promise<void> {
    const browser = this.deps.browser();
    let result;
    try {
      result = await readSite(task, browser);
    } finally {
      // Nothing one site set (cookies, storage, cache) reaches the next.
      await browser.reset();
    }
    this.deps.log?.(`local crawl ${task.domain}: ${result.outcome}, ${result.emails?.length ?? 0} addresses, ${result.pages} pages`);
    await this.deps.api('/v1/local-crawl/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ companyId: task.companyId, ...result }),
    });
  }
}
