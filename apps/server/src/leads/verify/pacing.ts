// SMTP session pacing. Mail providers judge us per provider, not as a whole:
// Google sees every Workspace domain we probe as one stream, while a small
// host only sees its own. So sessions are counted in sliding one minute
// windows per provider, under a global ceiling, and IPv4 sessions under their
// own cap (the VPS provider throttles outbound port 25 on IPv4, not IPv6).

/** A window is full; a slot frees up after retryAfterMs. */
export class PacedError extends Error {
  constructor(
    readonly retryAfterMs: number,
    /** True when every IPv4 lane is paused because its port 25 looks blocked, not merely full. */
    readonly port25Blocked = false,
  ) {
    super('smtp sessions paced');
  }
}

export interface Limit {
  key: string;
  /** Sessions per minute. 0 means no limit. */
  perMinute: number;
}

const WINDOW_MS = 60_000;

export class SessionPacer {
  private readonly windows = new Map<string, number[]>();
  private readonly cooldowns = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /**
   * Counts one session against every limit, or throws PacedError (counting
   * nothing) when any of them is full or cooling down.
   */
  take(limits: Limit[]): void {
    const now = this.now();
    let wait = 0;
    for (const { key, perMinute } of limits) {
      const until = this.cooldowns.get(key) ?? 0;
      if (until > now) wait = Math.max(wait, until - now);
      if (perMinute <= 0) continue;
      const starts = this.window(key, now);
      if (starts.length >= perMinute) wait = Math.max(wait, starts[starts.length - perMinute]! + WINDOW_MS - now);
    }
    if (wait > 0) throw new PacedError(wait);
    for (const { key, perMinute } of limits) if (perMinute > 0) this.window(key, now).push(now);
  }

  /** Stops sessions under `key` for a while, after a server asked us to slow down. */
  cool(key: string, ms: number): void {
    this.cooldowns.set(key, Math.max(this.cooldowns.get(key) ?? 0, this.now() + ms));
  }

  private window(key: string, now: number): number[] {
    let starts = this.windows.get(key);
    if (!starts) {
      starts = [];
      this.windows.set(key, starts);
      if (this.windows.size > 5_000) this.prune(now);
    }
    while (starts.length > 0 && starts[0]! <= now - WINDOW_MS) starts.shift();
    return starts;
  }

  private prune(now: number): void {
    for (const [key, starts] of this.windows) {
      if (starts.length === 0 || starts[starts.length - 1]! <= now - WINDOW_MS) this.windows.delete(key);
    }
  }
}

/** Second level labels under which a country code TLD sells names: example.co.uk is one company. */
const SECOND_LEVEL = new Set(['co', 'com', 'net', 'org', 'ac', 'gov', 'edu', 'ne', 'or']);

/** The registrable domain of a host, roughly: mx1.example.co.uk is example.co.uk. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  const n = labels.length;
  const take = n >= 3 && labels[n - 1]!.length === 2 && SECOND_LEVEL.has(labels[n - 2]!) ? 3 : 2;
  return labels.slice(-take).join('.');
}

/**
 * Who answers for an MX host, for pacing: google (Gmail and Workspace),
 * outlook (Microsoft 365), else the MX host's registrable domain.
 */
export function mailProvider(host: string): string {
  const domain = registrableDomain(host);
  if (domain === 'google.com' || domain === 'googlemail.com') return 'google';
  if (domain === 'outlook.com' || host.toLowerCase().replace(/\.$/, '').endsWith('.mx.microsoft')) return 'outlook';
  return domain;
}
