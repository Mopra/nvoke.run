'use client';

import Link from 'next/link';
import { FEED_SOURCES, type Drop, type DropListResponse, type Search } from '@nvoke/shared';
import { Readout } from '@/components/mockups/parts';
import { progressCaption } from '@/components/app/search-progress';
import { Count, DropLed, RunMeter } from '@/components/app/drops/parts';
import { FEED_SOURCE_LABEL, formatNumber, isActive, nextRunLabel } from '@/lib/app/desktop';
import { dropPath, dropRuns, dropState, feedTotal } from '@/lib/app/drops';
import { cn } from '@/lib/utils';

/**
 * The drops screen's display: the feed on a black screen. While a drop
 * delivers it leads with that run (its LED blinks, its meter fills, its name
 * links to the drop); otherwise with the launches collected this week and
 * when the next drop runs. Under it each source's week, counting up over its
 * ghost digits, with an LED that is lit when the server collects it.
 */
export function FeedDisplay({ data, searches, className }: { data: DropListResponse | undefined; searches: Search[] | undefined; className?: string }) {
  const drops = data?.drops ?? [];
  const delivering = drops
    .map((drop) => ({ drop, run: dropRuns(searches, drop.id).find((r) => isActive(r.status)) }))
    .find((d) => d.run);
  const checking = drops.find((d) => dropState(d) === 'due');
  const next = drops
    .filter((d) => d.enabled)
    .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt))[0];
  const total = data ? feedTotal(data.sources) : null;
  const widest = Math.max(999, ...(data?.sources.map((s) => s.lastWeek) ?? []));
  const live = !!delivering || !!checking;

  return (
    <section aria-label="The feed" className={cn('screen screen-hero relative overflow-hidden p-5 sm:p-8', className)}>
      <div className="flex items-center gap-3">
        <DropLed state={live ? 'running' : next ? 'daily' : 'paused'} screen />
        <span className={cn('cap', live ? 'text-primary' : 'text-screen-foreground/40')}>Live</span>
        <span className={cn('cap', live || !next ? 'text-screen-foreground/40' : 'text-screen-foreground/80')}>Idle</span>
        <span className="cap ml-auto truncate text-screen-foreground/50">Last 7 days</span>
      </div>

      <div className="mt-6 min-h-[88px] sm:mt-8 sm:min-h-[96px]">
        {delivering?.run ? (
          <Live drop={delivering.drop} caption={progressCaption(delivering.run)} run={delivering.run} />
        ) : checking ? (
          <Live drop={checking} caption="Looking for new launches" />
        ) : (
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
            <span aria-hidden>
              <Count value={total} widest={widest} className="text-[52px] sm:text-[88px]" />
            </span>
            {total !== null && <span className="sr-only">{formatNumber(total)} new launches this week</span>}
            <div className="flex flex-col items-start gap-1.5 pb-1 sm:items-end">
              <span className="cap text-screen-foreground/80">New launches this week</span>
              {data && (
                <span className="cap text-screen-foreground/40">
                  {next ? `${next.name} · ${nextRunLabel(next)}` : drops.length > 0 ? 'Every drop is paused' : 'No drop watches them yet'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-4 sm:pt-6">
        {FEED_SOURCES.map((source) => {
          const status = data?.sources.find((s) => s.source === source);
          return (
            <Readout key={source} label={FEED_SOURCE_LABEL[source]}>
              <div className="flex items-end gap-3">
                <Count value={status ? status.lastWeek : null} widest={widest} className="text-[30px] sm:text-[40px]" />
                <span
                  aria-label={status && !status.available ? 'Not collected on this server' : undefined}
                  className={cn(
                    'led mb-1.5',
                    status?.available ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]' : 'bg-screen-dim',
                  )}
                />
              </div>
            </Readout>
          );
        })}
      </div>
    </section>
  );
}

/** The drop that is working right now: its name in dot matrix, what it does and the meter. */
function Live({ drop, caption, run }: { drop: Drop; caption: string; run?: Search }) {
  return (
    <Link href={dropPath(drop.id)} className="block rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
      <span className="lcd block truncate text-[24px] leading-tight uppercase sm:text-[40px]" title={drop.name}>
        {drop.name}
      </span>
      <span className="cap mt-2 block truncate text-screen-foreground/50">{caption}</span>
      <div className="mt-4">
        <RunMeter run={run} sweep={!run} />
      </div>
    </Link>
  );
}
