'use client';

import { FEED_SOURCES, type Drop, type FeedSource, type FeedSourceStatus, type Search } from '@nvoke/shared';
import { Readout, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { Count, DropLed, RunMeter } from '@/components/app/drops/parts';
import { FEED_SOURCE_LABEL, formatNumber, isActive } from '@/lib/app/desktop';
import { DROP_STATE_LABEL, type DropState } from '@/lib/app/drops';
import { cn } from '@/lib/utils';

/**
 * A drop on a black display, read back from the form as it is typed: its
 * state LED, its name in dot matrix, what it watches, and a figure that
 * counts up over its ghost digits (the companies delivered, or for a new
 * drop the launches its sources brought this week). The meter runs while a
 * run delivers or the drop checks; between runs it shows how full the last
 * run was. Under it the drop's runs and emails, or for a new drop each
 * source, its LED lit when picked.
 */
export function DropDisplay({
  drop,
  state,
  title,
  summary,
  next,
  runs,
  sources,
  picked,
  pending,
  className,
}: {
  drop?: Drop;
  state: DropState;
  title: string;
  summary: string;
  next: string;
  runs: Search[];
  sources: FeedSourceStatus[];
  picked: FeedSource[];
  pending: boolean;
  className?: string;
}) {
  const week = (s: FeedSource): number | null => {
    const status = sources.find((x) => x.source === s);
    return status ? status.lastWeek : null;
  };
  const widestWeek = Math.max(999, ...sources.map((s) => s.lastWeek));
  const pickedWeek = sources.length > 0 ? picked.reduce((n, s) => n + (week(s) ?? 0), 0) : null;
  const live = runs.find((r) => isActive(r.status));
  const last = runs[0];
  const sum = (pick: (s: Search) => number): number => runs.reduce((n, s) => n + pick(s), 0);
  const lit = drop && last ? Math.min(METER_SEGMENTS, Math.round((last.companiesFound / Math.max(1, drop.dailyLimit)) * METER_SEGMENTS)) : 0;
  const busy = pending || state === 'running' || state === 'due';

  return (
    <section aria-label={drop ? drop.name : 'The new drop'} className={cn('screen screen-hero relative overflow-hidden p-5 sm:p-8', className)}>
      <div className="flex items-center gap-3">
        <DropLed state={pending ? 'due' : drop ? state : 'paused'} screen />
        <span className={cn('cap', busy ? 'text-primary' : 'text-screen-foreground/70')}>
          {pending ? 'Saving' : drop ? DROP_STATE_LABEL[state] : 'New drop'}
        </span>
        <span className="cap ml-auto truncate text-screen-foreground/50">{next}</span>
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 sm:mt-8">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <p className="lcd truncate text-[24px] leading-tight uppercase sm:text-[40px]" title={title}>
            {title}
          </p>
          <p className="cap mt-2 truncate text-screen-foreground/50" title={summary}>
            {summary}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <span className="cap text-screen-foreground/50">{drop ? 'Companies delivered' : 'Launches this week'}</span>
          {/* Dot matrix glyphs paint above a tight line box: room so they clear the label. */}
          <span aria-hidden className="block pt-2 sm:pt-3">
            <Count
              value={drop ? drop.companiesDelivered : pickedWeek}
              widest={drop ? Math.max(999, drop.companiesDelivered) : widestWeek}
              className="text-[44px] sm:text-[64px]"
            />
          </span>
          <span className="sr-only">
            {drop
              ? `${formatNumber(drop.companiesDelivered)} companies delivered`
              : pickedWeek !== null && `${formatNumber(pickedWeek)} launches this week from the picked sources`}
          </span>
        </div>
      </div>

      <div className="mt-5">
        {busy ? <RunMeter run={pending ? undefined : live} sweep={pending || !live} /> : <ScreenMeter lit={lit} />}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-4 sm:pt-6">
        {drop ? (
          <>
            <Readout label="Runs">
              <Count value={runs.length} widest={99} className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
            <Readout label="Emails found">
              <Count value={sum((r) => r.emailsFound)} widest={999} className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
            <Readout label="Valid">
              <Count value={sum((r) => r.emailsValid)} widest={999} className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
            <Readout label="A day, at most">
              <Count value={drop.dailyLimit} widest={999} className="self-start text-[30px] sm:text-[40px]" />
            </Readout>
          </>
        ) : (
          FEED_SOURCES.map((s) => (
            <Readout key={s} label={FEED_SOURCE_LABEL[s]}>
              <div className="flex items-end gap-3">
                <Count value={week(s)} widest={widestWeek} className="text-[30px] sm:text-[40px]" />
                <span aria-hidden className={cn('led mb-1.5', picked.includes(s) ? 'led-on' : 'bg-screen-dim')} />
              </div>
            </Readout>
          ))
        )}
      </div>
    </section>
  );
}
