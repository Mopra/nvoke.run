'use client';

import type { MeResponse } from '@nvoke/shared';
import { Figure, METER_SEGMENTS, Readout } from '@/components/mockups/parts';
import { useInView } from '@/components/site/home/motion';
import { formatNumber, periodLabel, resetDate } from '@/lib/app/desktop';
import { planName, quotaState } from '@/lib/app/quota';
import { cn } from '@/lib/utils';
import { daysToReset, ghostOf, useCountUp } from './motion';

/**
 * The month on the black display: the verified emails used counting up over
 * ghost digits as wide as the plan, the plan beside it, the meter filling
 * segment by segment (red from 90%), and plan, left and reset under a hairline.
 */
export function UsageDisplay({ me }: { me: MeResponse }) {
  const [ref, inView] = useInView<HTMLElement>('0px 0px -10% 0px', true);
  const quota = quotaState(me);
  const { period } = me.usage;
  const used = useCountUp(quota.used, inView);
  const limit = formatNumber(quota.limit);
  const lit = quota.limit > 0 ? Math.min(METER_SEGMENTS, Math.ceil((used / quota.limit) * METER_SEGMENTS)) : METER_SEGMENTS;
  const hot = quota.share >= 90;
  const days = daysToReset(period);
  const out = quota.level === 'out';

  return (
    <section ref={ref} data-usage aria-label="This month" className="screen screen-hero p-5 sm:p-8">
      <div className="flex items-center gap-3">
        <span className={cn('led', out ? 'bg-destructive' : 'led-on')} />
        <span className="cap text-screen-foreground/60">Verified this month</span>
        <span className="cap ml-auto text-screen-foreground/60">{periodLabel(period)}</span>
      </div>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <Figure value={formatNumber(used)} ghost={ghostOf(limit)} className="text-[52px] sm:text-[80px]" />
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="cap text-primary">Of</span>
          <span className="lcd text-[28px] leading-none sm:text-[36px]">{limit}</span>
          {days !== null && (
            <span className="cap text-screen-foreground/60 tabular-nums">
              {days === 0 ? 'Resets today' : `${days} ${days === 1 ? 'day' : 'days'} to reset`}
            </span>
          )}
        </div>
      </div>

      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={quota.limit}
        aria-valuenow={quota.used}
        aria-valuetext={`${formatNumber(quota.used)} of ${limit}`}
        className="mt-8 flex gap-[2px]"
      >
        {Array.from({ length: METER_SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-2.5 min-w-0 flex-1 rounded-[1px] bg-screen-dim transition-colors duration-300 motion-reduce:transition-none',
              i < lit && (hot ? 'bg-destructive shadow-[0_0_6px_var(--destructive)]' : 'bg-primary shadow-[0_0_6px_var(--primary)]'),
            )}
          />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4 border-t border-screen-foreground/10 pt-5">
        <Readout label="Plan">
          <span className="cap text-screen-foreground">{planName(me.plan)}</span>
        </Readout>
        <Readout label="Left">
          <span className={cn('cap tabular-nums', out ? 'text-destructive' : 'text-primary')}>{formatNumber(quota.left)}</span>
        </Readout>
        <Readout label="Resets" className="text-right sm:text-left">
          <span className="cap text-screen-foreground">{resetDate(period)}</span>
        </Readout>
      </div>
    </section>
  );
}
