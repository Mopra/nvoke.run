'use client';

import { Figure, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { ghostFor, useCountUp } from '@/components/app/searches/count';
import { useTicker } from '@/components/site/home/motion';
import { formatNumber } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';

/**
 * The search as it will start, read back on a black display while the form
 * is filled in: the kind, the title in dot matrix, what it asks for, and the
 * verified emails left this month counting up over their ghost digits. On
 * Start the LED blinks and the meter runs until the search's page opens.
 */
export function Readback({
  kind,
  title,
  placeholder,
  detail,
  left,
  limit,
  pending,
  className,
}: {
  kind: string;
  /** What the search will be called; empty while the form is. */
  title: string;
  placeholder: string;
  detail: string;
  left: number | null;
  limit: number;
  pending: boolean;
  className?: string;
}) {
  const shown = useCountUp(left);
  const sweep = useTicker(70, pending, METER_SEGMENTS) % (METER_SEGMENTS + 4);
  return (
    <div className={cn('screen screen-hero p-4 sm:p-6', className)}>
      <div className="flex items-start gap-5">
        <div aria-hidden className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className={cn('led', pending ? 'led-on motion-safe:animate-blink' : 'bg-screen-dim')} />
            <span className={cn('cap', pending ? 'text-primary' : 'text-screen-foreground/50')}>{pending ? 'Starting' : kind}</span>
          </div>
          <p
            key={title ? 'lit' : 'empty'}
            className={cn(
              'lcd mt-4 truncate text-[20px] leading-tight uppercase sm:text-[30px]',
              !title && 'text-screen-foreground/25 [text-shadow:none]',
            )}
          >
            {title || placeholder}
          </p>
          <p className="cap mt-2 truncate text-screen-foreground/50">{detail}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <span aria-hidden className="cap text-screen-foreground/50">Left</span>
          <span aria-hidden>
            <Figure
              value={shown === null ? '' : formatNumber(shown)}
              ghost={ghostFor(formatNumber(Math.max(limit, left ?? 0)))}
              className="text-[26px] sm:text-[36px]"
            />
          </span>
          {left !== null && <span className="sr-only">{formatNumber(left)} verified emails left this month</span>}
        </div>
      </div>
      <ScreenMeter lit={pending ? Math.min(sweep, METER_SEGMENTS) : 0} className="mt-5" />
    </div>
  );
}
