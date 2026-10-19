'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

export type ToolStep = { title: string; body: string };

const STEP_TICKS = 16;
const HOLD_TICKS = 26;

/**
 * A tool's method as the homepage's pipeline: an orange line runs along the
 * hairline over each step in turn, its LED blinks, then the next one starts.
 * Reduced motion shows every step lit.
 */
export function ToolSteps({ steps }: { steps: ToolStep[] }) {
  const [ref, inView] = useInView<HTMLOListElement>();
  const cycle = steps.length * STEP_TICKS + HOLD_TICKS;
  const tick = useTicker(70, inView, steps.length * STEP_TICKS) % cycle;

  return (
    <ol ref={ref} className={cn('mt-14 grid gap-x-10 gap-y-12 sm:mt-20', steps.length === 3 ? 'md:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4')}>
      {steps.map((step, i) => {
        const p = Math.min(1, Math.max(0, (tick - i * STEP_TICKS) / STEP_TICKS));
        const active = p > 0 && p < 1;
        const done = p >= 1;
        return (
          <li key={step.title} className="relative border-t pt-6">
            <span
              aria-hidden="true"
              className="absolute -top-px left-0 h-0.5 bg-primary shadow-[0_0_8px_var(--primary)]"
              style={{ width: `${p * 100}%`, opacity: done ? 0.35 : 1 }}
            />
            <span className="flex items-center gap-2.5">
              <span aria-hidden="true" className={cn('led', active && 'led-on animate-blink', done && 'bg-foreground')} />
              <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
            </span>
            <h3 className="mt-8 text-title font-light text-balance">{step.title}</h3>
            <p className="mt-3 max-w-xs text-[15px] text-pretty text-muted-foreground">{step.body}</p>
          </li>
        );
      })}
    </ol>
  );
}
