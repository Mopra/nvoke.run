'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { formatCount } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/** The four steps of a search. `to` is what the step's readout counts up to, `unit` what it counts. */
const STEPS = [
  { cap: 'Find', line: 'Local businesses, web results or this week’s launches.', to: 48, unit: 'companies' },
  { cap: 'Crawl', line: 'Their own website, read today. Not a list from last year.', to: 212, unit: 'pages read' },
  { cap: 'Verify', line: 'The mail server says if the mailbox exists.', to: 71, unit: 'valid emails' },
  { cap: 'Export', line: 'A CSV, the API or MCP, into the tools you already use.', to: 71, unit: 'rows in leads.csv' },
] as const;

const STEP_TICKS = 18;
const HOLD_TICKS = 22;
const CYCLE = STEPS.length * STEP_TICKS + HOLD_TICKS;

/**
 * How it works as a search running through it: an orange line travels along
 * the hairline over each step, its LED blinks, its readout counts up, then
 * the next one starts. All four hold lit for a moment and it runs again.
 */
export function Pipeline() {
  const [ref, inView] = useInView<HTMLOListElement>();
  const tick = useTicker(70, inView, STEPS.length * STEP_TICKS) % CYCLE;

  return (
    <ol ref={ref} className="mt-16 grid gap-x-10 gap-y-12 sm:mt-24 sm:grid-cols-2 lg:grid-cols-4">
      {STEPS.map((step, i) => {
        const p = Math.min(1, Math.max(0, (tick - i * STEP_TICKS) / STEP_TICKS));
        const active = p > 0 && p < 1;
        const done = p >= 1;
        return (
          <li key={step.cap} className="relative border-t pt-6">
            <span
              aria-hidden="true"
              className="absolute -top-px left-0 h-0.5 bg-primary shadow-[0_0_8px_var(--primary)]"
              style={{ width: `${p * 100}%`, opacity: done ? 0.35 : 1 }}
            />
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn('led', active && 'led-on animate-blink', done && 'bg-foreground')}
              />
              <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <h3 className="mt-8 text-title font-light">{step.cap}</h3>
            <p className="mt-3 max-w-[16rem] text-[15px] text-pretty text-muted-foreground">{step.line}</p>
            <p aria-hidden="true" className={cn('cap mt-6 tabular-nums transition-colors', p > 0 ? 'text-foreground' : 'text-muted-foreground')}>
              <span className={cn(active && 'text-primary')}>{formatCount(Math.round(step.to * p))}</span> {step.unit}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
