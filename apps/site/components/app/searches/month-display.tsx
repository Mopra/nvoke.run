'use client';

import Link from 'next/link';
import type { MeResponse, Search } from '@nvoke/shared';
import { Figure, METER_SEGMENTS, Readout, ScreenMeter } from '@/components/mockups/parts';
import { progressCaption } from '@/components/app/search-progress';
import { ghostFor, useCountUp } from '@/components/app/searches/count';
import { useTicker } from '@/components/site/home/motion';
import { formatNumber, isActive, percent, periodLabel, resetDate, searchTitle } from '@/lib/app/desktop';
import { BILLING_PATH } from '@/lib/app/quota';
import { cn } from '@/lib/utils';

/** The month a search was started in, as `yyyy-mm` in UTC like the usage period. */
function monthOf(search: Search): string {
  return new Date(search.createdAt).toISOString().slice(0, 7);
}

/** A lit figure over its ghost digits, counting up; dark until its value is in. */
function Count({ value, widest, className }: { value: number | null; widest: number; className?: string }) {
  const shown = useCountUp(value);
  return <Figure value={shown === null ? '' : formatNumber(shown)} ghost={ghostFor(formatNumber(Math.max(widest, value ?? 0)))} className={className} />;
}

/**
 * The searches screen's display: the month on a black screen. While a search
 * runs it leads with that search (its LED blinks, its meter fills, its title
 * links to it); otherwise with the verified emails left. Under it the month
 * in four figures that count up over their ghost digits. Before the data is
 * in it shows the unlit segments only.
 */
export function MonthDisplay({ me, searches, className }: { me: MeResponse | undefined; searches: Search[] | undefined; className?: string }) {
  const running = searches?.filter((s) => isActive(s.status)) ?? [];
  const current = running[0];
  const period = me?.usage.period ?? null;
  const month = period && searches ? searches.filter((s) => monthOf(s) === period) : null;
  const sum = (pick: (s: Search) => number): number | null => (month ? month.reduce((n, s) => n + pick(s), 0) : null);
  const limit = me?.usage.emailsLimit ?? 0;
  const left = me ? Math.max(0, limit - me.usage.emailsVerified) : null;

  return (
    <section aria-label="This month" className={cn('screen screen-hero relative overflow-hidden p-5 sm:p-8', className)}>
      <div className="flex items-center gap-3">
        <span className={cn('led', current ? 'led-on motion-safe:animate-blink' : me ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]' : 'bg-screen-dim')} />
        <span className={cn('cap', current ? 'text-primary' : 'text-screen-foreground/60')}>Run</span>
        <span className={cn('cap', current || !me ? 'text-screen-foreground/60' : 'text-screen-foreground/80')}>Idle</span>
        {period && (
          <span className="cap ml-auto truncate text-screen-foreground/60">
            {periodLabel(period)}
          </span>
        )}
      </div>

      <div className="mt-6 min-h-[88px] sm:mt-8 sm:min-h-[96px]">
        {current ? (
          <Running search={current} more={running.length - 1} />
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <Link
              href={BILLING_PATH}
              aria-label={left === null ? 'Verified emails left this month' : `${formatNumber(left)} of ${formatNumber(limit)} verified emails left this month`}
              className="block rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Count value={left} widest={limit} className="text-[52px] sm:text-[88px]" />
            </Link>
            <div className="flex flex-col items-start gap-1.5 pb-1 sm:items-end">
              <span className="cap text-screen-foreground/80">Verified emails left</span>
              {me && (
                <span className="cap text-screen-foreground/60">
                  of {formatNumber(limit)} &#183; resets {resetDate(me.usage.period)}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-4 sm:pt-6">
        <Readout label="Searches">
          <Count value={month ? month.length : null} widest={99} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Emails found">
          <Count value={sum((s) => s.emailsFound)} widest={999} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Valid">
          <Count value={sum((s) => s.emailsValid)} widest={999} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
        <Readout label="Charged">
          <Count value={me?.usage.emailsVerified ?? null} widest={limit} className="self-start text-[30px] sm:text-[40px]" />
        </Readout>
      </div>
    </section>
  );
}

/**
 * The running search on the display: its title, what it is doing and the
 * meter. Solid segments are companies read, dim ones companies found. A
 * queued search has nothing to show yet, so a dim sweep runs while it waits.
 */
function Running({ search, more }: { search: Search; more: number }) {
  const queued = search.status === 'queued';
  const sweep = useTicker(140, queued, METER_SEGMENTS) % (METER_SEGMENTS + 1);
  const scale = Math.max(search.limit, search.companiesFound, 1);
  const lit = Math.round((percent(search.companiesCrawled, scale) / 100) * METER_SEGMENTS);
  const dim = Math.round((percent(search.companiesFound, scale) / 100) * METER_SEGMENTS);
  const title = searchTitle(search);
  return (
    <Link
      href={`/app/searches/${search.id}`}
      className="block rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
    >
      <span className="lcd block truncate text-[24px] leading-tight uppercase sm:text-[40px]" title={title}>
        {title}
      </span>
      <span className="cap mt-2 block truncate text-screen-foreground/60">
        {progressCaption(search)}
        {more > 0 && ` · ${more} more running`}
      </span>
      <div
        role="progressbar"
        aria-label={`${title}: companies read`}
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={search.companiesCrawled}
        className="mt-4"
      >
        <ScreenMeter lit={queued ? 0 : lit} dim={queued ? sweep : Math.max(dim, lit + 1)} />
      </div>
    </Link>
  );
}
