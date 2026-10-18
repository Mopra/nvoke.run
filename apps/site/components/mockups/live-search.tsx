'use client';

import { useEffect, useState } from 'react';
import { Figure, METER_SEGMENTS, Readout, ScreenMeter } from '@/components/mockups/parts';
import { cn } from '@/lib/utils';

type Run = { title: string; kind: string; companies: number; emails: number; valid: number };

/** Three searches the screen runs in turn, one of each kind. Figures as a real run of that size would land. */
const RUNS: Run[] = [
  { title: 'Dentists in Austin', kind: 'Local', companies: 48, emails: 112, valid: 71 },
  { title: 'Shopify agencies UK', kind: 'Web', companies: 60, emails: 143, valid: 88 },
  { title: 'Launches this week', kind: 'Launches', companies: 36, emails: 54, valid: 39 },
];

const TICK = 120;
const RUN_TICKS = 80;
const DONE_TICKS = 28;

function stageOf(p: number): string {
  if (p < 0.22) return 'Finding companies';
  if (p < 0.78) return 'Reading websites';
  return 'Asking mail servers';
}

/**
 * The hero's screen: a search running live, as on the desktop's display.
 * The LED blinks, the meter fills segment by segment, the figures count up
 * over their ghost digits, then it reads DONE and the next search starts.
 * Under reduced motion it shows the first search, finished, and stays still.
 */
export function LiveSearch({ className }: { className?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTick(RUN_TICKS);
      return;
    }
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, TICK);
    return () => window.clearInterval(id);
  }, []);

  const cycle = RUN_TICKS + DONE_TICKS;
  const index = Math.floor(tick / cycle) % RUNS.length;
  const run = RUNS[index]!;
  const at = tick % cycle;
  const p = Math.min(1, at / RUN_TICKS);
  const done = p >= 1;

  const found = Math.round(run.companies * Math.min(1, p * 2.4));
  const crawled = Math.round(run.companies * p);
  const emails = Math.round(run.emails * Math.min(1, Math.max(0, (p - 0.18) / 0.6)));
  const valid = Math.round(run.valid * Math.max(0, (p - 0.3) / 0.7));
  const lit = Math.round((crawled / run.companies) * METER_SEGMENTS);
  const dim = Math.round((found / run.companies) * METER_SEGMENTS);

  return (
    <div
      role="img"
      aria-label={`A search for ${run.title} running in nvoke: companies found, websites read, emails checked with the mail server.`}
      className={cn('screen relative overflow-hidden p-5 sm:p-6', className)}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className={cn('led', done ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]' : 'led-on motion-safe:animate-blink')} />
          <span className={cn('cap', done ? 'text-screen-foreground/40' : 'text-primary')}>Run</span>
          <span className={cn('cap', done ? 'text-primary' : 'text-screen-foreground/40')}>Done</span>
          <span className="cap ml-auto text-screen-foreground/50 tabular-nums">
            {run.kind} &#183; {String(index + 1).padStart(2, '0')} / {String(RUNS.length).padStart(2, '0')}
          </span>
        </div>

        <p className="lcd mt-5 truncate text-[22px] leading-tight uppercase sm:text-[26px]">{run.title}</p>
        <p className="cap mt-2 truncate text-screen-foreground/50">
          {done ? `${run.companies} companies read` : `${stageOf(p)} · ${crawled} of ${found}`}
        </p>
        <ScreenMeter lit={lit} dim={dim} className="mt-4" />

        <div className="mt-6 grid grid-cols-3 gap-3 border-t border-screen-dim pt-5">
          <Readout label="Companies">
            <Figure value={found} ghost="888" className="text-[30px] sm:text-[40px]" />
          </Readout>
          <Readout label="Emails">
            <Figure value={emails} ghost="888" className="text-[30px] sm:text-[40px]" />
          </Readout>
          <Readout label="Valid" className="[&>span:first-child]:text-primary">
            <Figure value={valid} ghost="888" className="text-[30px] sm:text-[40px]" />
          </Readout>
        </div>
      </div>
    </div>
  );
}
