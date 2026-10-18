import { formatNumber, percent, periodLabel, resetDate } from '@/lib/format';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The month's verified emails: a small black screen with the figure lit and a PLAN / USED / LEFT readout over a meter. */
export function Usage({ me }: { me: Me }) {
  const { emailsVerified: used, emailsLimit: limit, period } = me.usage;
  const share = percent(used, limit);
  const left = Math.max(0, limit - used);
  const note =
    left === 0
      ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
      : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`;
  return (
    <section className="screen p-4">
      <div className="flex items-baseline justify-between gap-6">
        <div className="lcd text-4xl text-screen-foreground tabular-nums">{formatNumber(used)}</div>
        <dl className="grid grid-cols-[max-content_max-content] gap-x-4 gap-y-0.5 text-right">
          <dt className="cap text-screen-foreground/50">Plan</dt>
          <dd className="cap text-screen-foreground tabular-nums">{formatNumber(limit)}</dd>
          <dt className="cap text-screen-foreground/50">Used</dt>
          <dd className="cap text-screen-foreground tabular-nums">{formatNumber(used)}</dd>
          <dt className="cap text-screen-foreground/50">Left</dt>
          <dd className="cap text-primary tabular-nums">{formatNumber(left)}</dd>
        </dl>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="mt-4 h-[3px] overflow-hidden bg-screen-dim"
      >
        <div
          className={cn('h-full transition-[width] duration-1000 ease-out-soft', share >= 90 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="cap mt-3 text-screen-foreground/50">{note}</p>
    </section>
  );
}
