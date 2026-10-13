import { describe, expect, it } from 'vitest';
import { KeyedMutex, RateLimiter, Semaphore, sleep } from './limits.js';

describe('RateLimiter', () => {
  it('spaces calls on one key and leaves other keys alone', async () => {
    const limiter = new RateLimiter(60);
    const start = Date.now();
    const times: Record<string, number[]> = { a: [], b: [] };
    await Promise.all([
      ...[0, 1, 2].map(() => limiter.wait('a').then(() => times.a!.push(Date.now() - start))),
      limiter.wait('b').then(() => times.b!.push(Date.now() - start)),
    ]);
    const a = times.a!.sort((x, y) => x - y);
    expect(a[1]! - a[0]!).toBeGreaterThanOrEqual(50);
    expect(a[2]! - a[1]!).toBeGreaterThanOrEqual(50);
    expect(times.b![0]!).toBeLessThan(40);
  });

  it('honors a longer per call interval (Crawl-delay)', async () => {
    const limiter = new RateLimiter(10);
    await limiter.wait('h', undefined, 80);
    const t = Date.now();
    await limiter.wait('h');
    expect(Date.now() - t).toBeGreaterThanOrEqual(70);
  });

  it('rejects on abort without blocking the queue', async () => {
    const limiter = new RateLimiter(100);
    await limiter.wait('k');
    const ac = new AbortController();
    const aborted = limiter.wait('k', ac.signal);
    ac.abort();
    await expect(aborted).rejects.toThrow(/aborted/);
    await limiter.wait('k');
  });
});

describe('KeyedMutex', () => {
  it('runs one task per key at a time', async () => {
    const mutex = new KeyedMutex();
    let active = 0;
    let peak = 0;
    const task = async () => {
      active++;
      peak = Math.max(peak, active);
      await sleep(10);
      active--;
    };
    await Promise.all([mutex.run('mx1', task), mutex.run('mx1', task), mutex.run('mx1', task)]);
    expect(peak).toBe(1);
    peak = 0;
    await Promise.all([mutex.run('mx1', task), mutex.run('mx2', task)]);
    expect(peak).toBe(2);
  });

  it('keeps going after a task throws', async () => {
    const mutex = new KeyedMutex();
    await expect(mutex.run('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(mutex.run('k', async () => 7)).resolves.toBe(7);
  });
});

describe('Semaphore', () => {
  it('never exceeds its cap', async () => {
    const sem = new Semaphore(3);
    let active = 0;
    let peak = 0;
    await Promise.all(
      Array.from({ length: 12 }, () =>
        sem.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await sleep(5);
          active--;
        }),
      ),
    );
    expect(peak).toBe(3);
  });
});
