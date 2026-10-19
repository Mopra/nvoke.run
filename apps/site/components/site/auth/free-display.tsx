'use client';

import { Figure, ScreenMeter, METER_SEGMENTS } from '@/components/mockups/parts';
import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

const STEPS = ['Sign up', 'Search', 'Export'] as const;

/**
 * Sign up's display: the free allowance counts up from nothing, the meter
 * fills with it, and the three steps light in turn, the first one now.
 */
export function FreeDisplay({ emails, className }: { emails: number; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px', true);
  const tick = useTicker(40, inView, 60);
  const p = Math.min(1, tick / 40);
  const shown = Math.round(emails * (1 - (1 - p) ** 3));
  const lit = Math.round(p * METER_SEGMENTS);
  const ghost = String(emails).replace(/\d/g, '8');

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`${emails} verified emails a month, free, no card.`}
      className={cn('screen screen-hero p-6 sm:p-9', className)}
    >
      <div aria-hidden="true">
        <div className="flex items-center gap-3">
          <span className="led led-on motion-safe:animate-blink" />
          <span className="cap text-screen-foreground/50">Free plan</span>
          <span className="cap ml-auto text-primary">No card</span>
        </div>
        <div className="mt-8 flex items-end gap-4">
          <Figure value={shown} ghost={ghost.padStart(3, '8')} className="text-[88px] sm:text-[120px]" />
          <div className="mb-3 flex flex-col gap-1.5">
            <span className="cap text-screen-foreground">Verified emails</span>
            <span className="cap text-screen-foreground/50">Every month</span>
          </div>
        </div>
        <ScreenMeter lit={lit} className="mt-6" />
        <ol className="mt-8 grid grid-cols-3 gap-3 border-t border-screen-dim pt-5">
          {STEPS.map((step, i) => {
            const on = i === 0 ? p > 0.2 : false;
            return (
              <li key={step} className="flex items-center gap-2">
                <span className={cn('led', on ? 'led-on' : 'bg-screen-dim')} />
                <span className={cn('cap', on ? 'text-screen-foreground' : 'text-screen-foreground/40')}>
                  {String(i + 1).padStart(2, '0')} {step}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
