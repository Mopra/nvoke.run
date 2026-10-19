'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { Drop, Search } from '@nvoke/shared';
import { StatusDot } from '@/components/app/indicators';
import { Figure, useArrivals } from '@/components/app/motion';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { APP_INSET } from '@/components/app/shell';
import { RevealHeading } from '@/components/site/home/reveal';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, formatNumber, isActive, nextRunLabel, relativeTime, STATUS_LABEL } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';

const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 md:grid-cols-[36px_minmax(0,1fr)_170px_84px_56px] lg:grid-cols-[36px_minmax(0,1fr)_200px_92px_64px]';

/** A run's day, as the row's title: "Sun 18 Oct". */
function runDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function RunStatus({ run }: { run: Search }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StatusDot status={run.status} />
      {isActive(run.status) ? (
        <SearchProgress search={run} className="h-2.5 w-24 shrink-0" />
      ) : (
        <span className="cap truncate text-muted-foreground">{STATUS_LABEL[run.status]}</span>
      )}
    </div>
  );
}

function RunRow({ run, index, style }: { run: Search; index: number; style?: CSSProperties }) {
  const active = isActive(run.status);
  const detail = active
    ? progressCaption(run)
    : run.status === 'failed'
      ? errorMessage(run.error)
      : `${formatNumber(run.companiesFound)} ${run.companiesFound === 1 ? 'company' : 'companies'} · ${relativeTime(run.createdAt)}`;
  return (
    <div
      style={style}
      className="group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]"
    >
      <Link href={`/app/searches/${run.id}`} aria-label={`Run of ${runDay(run.createdAt)}`} className="absolute inset-0 outline-none" />
      <div className={cn('pointer-events-none relative py-4', APP_INSET, GRID)}>
        <span className="cap hidden text-muted-foreground md:block">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <div className="truncate font-display text-base">{runDay(run.createdAt)}</div>
          <div className="mt-1 truncate font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase" title={detail}>
            {detail}
          </div>
          <div className="mt-2 md:hidden">
            <RunStatus run={run} />
          </div>
        </div>
        <div className="hidden md:block">
          <RunStatus run={run} />
        </div>
        <div
          className={cn(
            'text-right font-display text-3xl font-light tracking-[-0.02em] tabular-nums transition-colors duration-500',
            active && 'text-primary',
          )}
        >
          <Figure value={run.emailsFound} />
        </div>
        <div className="hidden text-right font-mono text-base tabular-nums text-muted-foreground md:block">{formatNumber(run.emailsValid)}</div>
      </div>
    </div>
  );
}

/**
 * What a drop delivered: one search per run that found something new, newest
 * first, each opening its results. Runs that find nothing make no search.
 */
export function DropRuns({ drop, runs, pending, className }: { drop: Drop; runs: Search[]; pending: boolean; className?: string }) {
  const arrive = useArrivals(runs.map((r) => r.id));
  return (
    <section aria-labelledby="drop-runs" className={className}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-5')}>
        <RevealHeading id="drop-runs" lines={['Runs']} className="font-display text-2xl font-light tracking-[-0.02em] sm:text-3xl" />
        <span className="cap text-muted-foreground">{nextRunLabel(drop)}</span>
      </div>
      <div className={cn(GRID, 'cap hidden pb-2 text-muted-foreground md:grid', APP_INSET)}>
        <span>Ch</span>
        <span>Run</span>
        <span>Status</span>
        <span className="text-right">Emails</span>
        <span className="text-right">Valid</span>
      </div>
      {pending ? (
        <div className={cn('flex flex-col gap-2.5 border-y border-border py-5', APP_INSET)}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      ) : runs.length === 0 ? (
        <p className={cn('border-y border-border py-8 text-sm text-muted-foreground', APP_INSET)}>
          Nothing delivered yet. A run that finds new launches lands here, crawled and verified; one that finds none leaves no trace.
        </p>
      ) : (
        <div className="stagger flex flex-col">
          {runs.map((r, i) => (
            <RunRow key={r.id} run={r} index={i} style={arrive(r.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
