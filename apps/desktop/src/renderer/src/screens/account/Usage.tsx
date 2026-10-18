import { formatNumber, percent, periodLabel, resetDate } from '@/lib/format';
import { useLook } from '@/lib/look';
import type { Me } from '@/lib/types';
import { cn } from '@/lib/utils';

/** The month's verified emails as one large number over a hairline meter. */
export function Usage({ me }: { me: Me }) {
  const look = useLook();
  const { emailsVerified, emailsLimit: limit, period } = me.usage;
  const share = percent(emailsVerified, limit);
  const left = Math.max(0, limit - emailsVerified);
  const note =
    left === 0
      ? `Out of verified emails for ${periodLabel(period)}. Searches stop at the limit until ${resetDate(period)}. Or upgrade.`
      : `${formatNumber(left)} left in ${periodLabel(period)}. Resets on ${resetDate(period)}.`;
  if (look === 'field') return <UsageReadout used={emailsVerified} limit={limit} left={left} share={share} note={note} />;
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
      <p className="mt-3 text-sm text-muted-foreground">{note}</p>
    </section>
  );
}

/** The Field look's name plate: a small black screen with the figure lit and a PLAN / USED / LEFT readout. */
function UsageReadout({ used, limit, left, share, note }: { used: number; limit: number; left: number; share: number; note: string }) {
  return (
    <section className="field:screen field:p-4">
      <div className="flex items-baseline justify-between gap-6">
        <div className="field:lcd text-4xl tabular-nums field:text-screen-foreground">{formatNumber(used)}</div>
        <dl className="grid grid-cols-[max-content_max-content] gap-x-4 gap-y-0.5 text-right">
          <dt className="field:cap field:text-screen-foreground/50">Plan</dt>
          <dd className="field:cap field:text-screen-foreground tabular-nums">{formatNumber(limit)}</dd>
          <dt className="field:cap field:text-screen-foreground/50">Used</dt>
          <dd className="field:cap field:text-screen-foreground tabular-nums">{formatNumber(used)}</dd>
          <dt className="field:cap field:text-screen-foreground/50">Left</dt>
          <dd className="field:cap field:text-primary tabular-nums">{formatNumber(left)}</dd>
        </dl>
      </div>
      <div
        role="meter"
        aria-label="Verified emails used this month"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={used}
        className="mt-4 h-[3px] overflow-hidden field:bg-screen-dim"
      >
        <div
          className={cn('h-full transition-[width] duration-1000 ease-out-soft', share >= 90 ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="mt-3 field:cap field:text-screen-foreground/50">{note}</p>
    </section>
  );
}
