interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function tryConsume(
  userId: string,
  ratePerSecond: number,
  burst: number,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(userId);
  const bucket: Bucket = existing ?? { tokens: burst, updatedAt: now };
  const elapsedMs = Math.max(0, now - bucket.updatedAt);
  const refilled = Math.min(burst, bucket.tokens + (elapsedMs / 1000) * ratePerSecond);

  if (refilled < 1) {
    const missing = 1 - refilled;
    const retryAfterMs = Math.ceil((missing / ratePerSecond) * 1000);
    bucket.tokens = refilled;
    bucket.updatedAt = now;
    buckets.set(userId, bucket);
    return { allowed: false, retryAfterMs };
  }

  bucket.tokens = refilled - 1;
  bucket.updatedAt = now;
  buckets.set(userId, bucket);
  return { allowed: true, retryAfterMs: 0 };
}

export function _resetForTests(): void {
  buckets.clear();
}
