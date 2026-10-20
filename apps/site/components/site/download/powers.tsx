'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

const POWERS = [
  { cap: 'Local render', line: 'Sites that block servers or need JavaScript, read from your own computer.', tag: 'On your machine' },
  { cap: 'Quick search', line: 'A shortcut over any app. Drop a CSV on it to enrich the list.', tag: 'Ctrl Shift Space' },
  { cap: 'Grab', line: 'Drag a box over any list on screen. nvoke reads the names and finds the companies.', tag: 'On screen' },
  { cap: 'Local copy', line: 'Every result on your computer. Instant filters, offline, drag into Excel.', tag: 'Offline' },
] as const;

const STEP_TICKS = 16;
const HOLD_TICKS = 24;
const CYCLE = POWERS.length * STEP_TICKS + HOLD_TICKS;

/**
 * The four power tools on a hairline. An orange line switches each one on
 * in turn, its LED blinks while it runs, its tag lights, then all four hold
 * and it runs again. Reduced motion shows all four on.
 */
export function Powers() {
  const [ref, inView] = useInView<HTMLOListElement>();
  const tick = useTicker(70, inView, POWERS.length * STEP_TICKS) % CYCLE;

  return (
    <ol ref={ref} className="mt-16 grid gap-x-10 gap-y-12 sm:mt-24 sm:grid-cols-2 lg:grid-cols-4">
      {POWERS.map((power, i) => {
        const p = Math.min(1, Math.max(0, (tick - i * STEP_TICKS) / STEP_TICKS));
        const active = p > 0 && p < 1;
        const done = p >= 1;
        return (
          <li key={power.cap} className="relative border-t pt-6">
            <span
              aria-hidden="true"
              className="absolute -top-px left-0 h-0.5 bg-primary shadow-[0_0_8px_var(--primary)]"
              style={{ width: `${p * 100}%`, opacity: done ? 0.35 : 1 }}
            />
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn('led', active && 'led-on animate-blink', done && 'bg-foreground')} />
              <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <h3 className="mt-8 text-title font-light">{power.cap}</h3>
            <p className="mt-3 max-w-[16rem] text-[15px] text-pretty text-muted-foreground">{power.line}</p>
            <p className={cn('cap mt-6 transition-colors', active ? 'text-primary' : done ? 'text-foreground' : 'text-muted-foreground')}>
              {power.tag}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
