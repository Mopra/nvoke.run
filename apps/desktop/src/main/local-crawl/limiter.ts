/** Spaces page loads per host at least `intervalMs` apart (longer for a robots.txt Crawl-delay). */
export class HostLimiter {
  private readonly next = new Map<string, number>();

  constructor(
    private readonly intervalMs = 1_000,
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  async wait(host: string, intervalMs = this.intervalMs): Promise<void> {
    const at = this.next.get(host) ?? 0;
    const start = Math.max(this.now(), at);
    this.next.set(host, start + Math.max(intervalMs, this.intervalMs));
    const delay = start - this.now();
    if (delay > 0) await this.sleep(delay);
  }
}
