'use client';

import { useInView, useTicker } from '@/components/site/home/motion';

const DIGITS = 6;

/** A run of finds: bursts of leads, then a pause while the next site is read. Deterministic, so server and client agree. */
const PERIOD = 23 * 13;
const PREFIX = Array.from({ length: PERIOD + 1 }, () => 0);
for (let t = 0; t < PERIOD; t++) PREFIX[t + 1] = PREFIX[t]! + (t % 23 < 14 ? ((t * 7919) % 13) + 1 : 0);

function countAt(tick: number): number {
  const n = Math.floor(tick / PERIOD) * PREFIX[PERIOD]! + PREFIX[tick % PERIOD]!;
  return n % 10 ** DIGITS;
}

/**
 * The foot of the page: a huge dot matrix counter climbing like a search
 * finding leads, faded into the page behind the last call to start. It is
 * scenery, not a statistic, so screen readers skip it.
 */
export function LeadCounter() {
  const [ref, inView] = useInView<HTMLDivElement>('0px');
  const tick = useTicker(60, inView, 400);
  const lit = String(countAt(tick));
  const ghost = '8'.repeat(DIGITS - lit.length);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none select-none text-center leading-[0.8] font-[family-name:var(--font-lcd)] font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums [mask-image:linear-gradient(to_bottom,black_15%,transparent_95%)] text-[clamp(5rem,27vw,26rem)]"
    >
      <span className="text-foreground/[0.05]">{ghost}</span>
      <span className="text-foreground/[0.16]">{lit}</span>
    </div>
  );
}
