// A fixed window counter per key, in memory. The API runs as one process, so
// this is enough for the public privacy routes; a restart resets it.

export interface RateLimiter {
  /** Counts one hit and returns false when the key is over its limit. */
  take(key: string): boolean;
}

export function fixedWindowLimiter(max: number, windowMs: number, now: () => number = Date.now): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  let nextSweep = now() + windowMs;
  return {
    take(key) {
      const t = now();
      if (t >= nextSweep) {
        for (const [k, w] of windows) if (w.resetAt <= t) windows.delete(k);
        nextSweep = t + windowMs;
      }
      const w = windows.get(key);
      if (!w || w.resetAt <= t) {
        windows.set(key, { count: 1, resetAt: t + windowMs });
        return true;
      }
      w.count++;
      return w.count <= max;
    },
  };
}
