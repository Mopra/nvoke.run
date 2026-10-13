// In-process politeness primitives. The worker is a single process on the
// VPS, so these are enough to keep us at one request per second per domain
// and one SMTP connection per MX host. Running several worker processes
// would multiply the rates; scale with WORKER_CONCURRENCY instead.

export class AbortedError extends Error {
  constructor() {
    super('aborted');
    this.name = 'AbortError';
  }
}

/** Sleeps, rejecting early when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AbortedError());
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortedError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

interface Slot {
  tail: Promise<void>;
  nextAt: number;
  lastUsed: number;
}

/**
 * Spaces calls per key (a host name) at least `intervalMs` apart. Callers on
 * the same key are served in arrival order. The interval can grow per call,
 * which is how a robots.txt Crawl-delay is honored.
 */
export class RateLimiter {
  private readonly slots = new Map<string, Slot>();

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Resolves when the caller may make its request. */
  async wait(key: string, signal?: AbortSignal, intervalMs: number = this.intervalMs): Promise<void> {
    this.prune();
    let slot = this.slots.get(key);
    if (!slot) {
      slot = { tail: Promise.resolve(), nextAt: 0, lastUsed: this.now() };
      this.slots.set(key, slot);
    }
    const s = slot;
    const turn = s.tail.then(async () => {
      const delay = s.nextAt - this.now();
      if (delay > 0) await sleep(delay, signal);
      if (signal?.aborted) throw new AbortedError();
      s.nextAt = this.now() + Math.max(this.intervalMs, intervalMs);
      s.lastUsed = this.now();
    });
    // The queue keeps moving even when one waiter aborts.
    s.tail = turn.catch(() => undefined);
    return turn;
  }

  private prune(): void {
    if (this.slots.size < 5_000) return;
    const cutoff = this.now() - 10 * 60_000;
    for (const [key, slot] of this.slots) {
      if (slot.lastUsed < cutoff && slot.nextAt < this.now()) this.slots.delete(key);
    }
  }
}

/** Runs at most one task at a time per key. */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const result = prev.catch(() => undefined).then(fn);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}

/** Counting semaphore for a global concurrency cap. */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      // The releasing task hands its slot straight to us, so active stays put.
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}
