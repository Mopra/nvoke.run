import { formatNumber, percent, periodLabel, resetDate } from '@/lib/format';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The month's verified emails as one large number over a hairline meter. */
export function Usage({ me }: { me: Me }) {
  const { emailsVerified, emailsLimit: limit, period } = me.usage;
  const share = percent(emailsVerified, limit);
  const left = Math.max(0, limit - emailsVerified);
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <span className="font-display text-5xl font-extralight tabular-nums">{formatNumber(emailsVerified)}</span>
        <span className="text-base text-muted-foreground">of {formatNumber(limit)} verified emails</span>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={emailsVerified}
        className="mt-6 h-[3px] overflow-hidden rounded-full bg-foreground/[0.08]"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-1000 ease-out-soft',
            share >= 90 ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {left === 0
          ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
          : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`}
      </p>
    </section>
  );
}
