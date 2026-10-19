'use client';

import { useEffect, useState, type ReactNode } from 'react';
import type { Search } from '@nvoke/shared';
import { progressCaption } from '@/components/app/search-progress';
import { useTweened } from '@/components/app/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { duration, formatNumber, isActive, percent, relativeTime, searchSubtitle, searchTitle } from '@/lib/app/desktop';
import { stageLine } from '@/lib/app/icp';
import { cn } from '@/lib/utils';

const SEGMENTS = 16;

/**
 * The search on one display, as the site's hero shows a run: the status LED
 * with WAIT, RUN and DONE printed beside it, the title in dot matrix, what the
 * pipeline is doing, the 16 segment meter and the four figures over their
 * ghost digits. Polling drives it: while the search runs the LED blinks, the
 * next segment flickers and every figure glides up with a `+n` as it grows.
 */
export function SearchDisplay({ search }: { search: Search }) {
  const active = isActive(search.status);
  const running = search.status === 'running';
  const queued = search.status === 'queued';
  const watching = !active && Boolean(search.ongoing);
  const note = active
    ? (stageLine(search) ?? progressCaption(search))
    : watching
      ? 'Watching for new companies'
      : search.status === 'failed'
        ? 'Stopped on an error'
        : search.status === 'canceled'
          ? 'Stopped, results kept'
          : `${formatNumber(search.companiesCrawled)} of ${formatNumber(search.companiesFound)} websites read`;
  const timing = search.startedAt
    ? `${active ? 'Running' : 'Took'} ${duration(search.startedAt, search.finishedAt)}`
    : relativeTime(search.createdAt);

  // The scale is the limit while companies are still being found, then the number found.
  const scale = active ? Math.max(search.limit, search.companiesFound, 1) : Math.max(search.companiesFound, 1);
  const lit = Math.min(SEGMENTS, Math.round((percent(search.companiesCrawled, scale) / 100) * SEGMENTS));
  const dim = Math.min(SEGMENTS, Math.round((percent(search.companiesFound, scale) / 100) * SEGMENTS));
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  const ghost = ghostOf(Math.max(search.limit, search.companiesFound, search.emailsFound));
  const last = search.status === 'failed' ? 'Failed' : search.status === 'canceled' ? 'Stopped' : 'Done';

  return (
    <section
      aria-labelledby="search-title"
      data-search-display
      data-status={search.status}
      className="screen screen-hero relative overflow-hidden p-5 sm:p-8"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'led transition-colors duration-500',
            running && 'led-on motion-safe:animate-blink',
            queued && 'bg-screen-foreground/50 motion-safe:animate-pulse',
            search.status === 'done' && 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]',
            search.status === 'failed' && 'bg-destructive shadow-[0_0_6px_var(--destructive)]',
            search.status === 'canceled' && 'bg-screen-foreground/35',
          )}
        />
        <span className="sr-only">{active ? (queued ? 'Queued' : 'Running') : last}</span>
        <span aria-hidden className="flex items-center gap-3">
          <StatusCap on={queued} tone="live">
            Wait
          </StatusCap>
          <StatusCap on={running} tone="live">
            Run
          </StatusCap>
          <StatusCap on={!active} tone={search.status === 'failed' ? 'failed' : 'plain'}>
            {last}
          </StatusCap>
        </span>
        {watching && (
          <span className="cap flex items-center gap-2 text-primary">
            <span aria-hidden className="led led-on motion-safe:animate-pulse" />
            Live
          </span>
        )}
        <span className="cap ml-auto min-w-0 truncate text-screen-foreground/50" title={searchSubtitle(search)}>
          {searchSubtitle(search)}
        </span>
      </div>

      <h1
        id="search-title"
        className="lcd mt-6 line-clamp-2 text-[24px] leading-[1.15] tracking-normal break-words uppercase sm:mt-8 sm:text-[38px]"
        title={search.kind === 'icp' ? search.params.description : searchTitle(search)}
      >
        {searchTitle(search)}
      </h1>
      <div className="cap mt-3 flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-screen-foreground/50">
        <span key={note} role="status" aria-live="polite" data-stage-note className="min-w-0 truncate tabular-nums motion-safe:animate-fade-in" title={note}>
          {note}
        </span>
        <span className="shrink-0 tabular-nums">
          {relativeTime(search.createdAt)} &#183; {timing}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Companies crawled"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={search.companiesCrawled}
        className="mt-5 flex gap-[2px] sm:mt-6"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'h-2.5 min-w-0 flex-1 rounded-[1px] bg-screen-dim transition-[background-color,box-shadow] duration-500 motion-reduce:transition-none',
              queued && i < 3 && 'bg-screen-foreground/40 motion-safe:animate-pulse',
              !queued && i < lit && (running ? 'bg-primary shadow-[0_0_6px_var(--primary)]' : meterTone(search.status)),
              !queued && i >= lit && i < dim && (running ? 'bg-primary/35' : 'bg-screen-foreground/20'),
              // The segment being read flickers while the search runs.
              running && i === lit && lit < SEGMENTS && 'bg-primary/50 motion-safe:animate-blink',
            )}
          />
        ))}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-4 sm:pt-7">
        <Reading
          label="Companies"
          value={search.companiesFound}
          ghost={ghost}
          live={active || watching}
          sub={search.ongoing ? undefined : `of ${formatNumber(search.limit)}`}
        />
        <Reading label="Crawled" value={search.companiesCrawled} ghost={ghost} live={active} />
        <Reading label="Emails" value={search.emailsFound} ghost={ghost} live={active || watching} />
        <Reading
          label="Valid"
          value={search.emailsValid}
          ghost={ghost}
          live={active || watching}
          sub={validShare === null ? undefined : `${validShare}%`}
          subLit={active}
        />
      </dl>
    </section>
  );
}

function meterTone(status: Search['status']): string {
  if (status === 'failed') return 'bg-destructive/70';
  if (status === 'canceled') return 'bg-screen-foreground/35';
  return 'bg-screen-foreground/75';
}

/** The unlit pattern under a figure, wide enough for the largest it can reach: "888" at least. */
function ghostOf(max: number): string {
  const digits = formatNumber(max).replace(/\d/g, '8');
  return digits.replace(/,/g, '').length < 3 ? '888' : digits;
}

function StatusCap({ on, tone = 'plain', children }: { on: boolean; tone?: 'plain' | 'live' | 'failed'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'cap transition-colors duration-500',
        !on && 'text-screen-foreground/30',
        on && tone === 'failed' && 'text-destructive',
        on && tone === 'live' && 'text-primary',
        on && tone === 'plain' && 'text-screen-foreground',
      )}
    >
      {children}
    </span>
  );
}

/**
 * One figure: its label above, the lit value over ghost digits, gliding to
 * each new value. A `+n` lights beside the label for a moment when it grows.
 */
function Reading({
  label,
  value,
  ghost,
  live,
  sub,
  subLit = false,
}: {
  label: string;
  value: number;
  ghost: string;
  live: boolean;
  sub?: string;
  subLit?: boolean;
}) {
  const shown = useTweened(value);
  const delta = useDelta(value, live);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      <dt className="cap flex min-w-0 items-center gap-2 text-screen-foreground/50">
        <span className="truncate">{label}</span>
        {delta && (
          <span key={delta.at} aria-hidden className="tabular-nums text-primary motion-safe:animate-pop-in">
            +{formatNumber(delta.n)}
          </span>
        )}
        {sub && <span className={cn('shrink-0 tabular-nums', subLit ? 'text-primary' : 'text-screen-foreground/80')}>{sub}</span>}
      </dt>
      <dd className="flex">
        <span className="relative inline-block text-[30px] leading-none whitespace-nowrap sm:text-[52px]">
          <span aria-hidden className="ghost">
            {ghost}
          </span>
          <span className="lcd absolute inset-y-0 right-0">{formatNumber(shown)}</span>
        </span>
      </dd>
    </div>
  );
}

/** How much a figure just grew, shown for 1.8 seconds. Null when it did not, or the search is not live. */
function useDelta(value: number, live: boolean): { n: number; at: number } | null {
  const [state, setState] = useState<{ value: number; delta: { n: number; at: number } | null }>({ value, delta: null });
  if (state.value !== value) {
    setState({ value, delta: live && value > state.value ? { n: value - state.value, at: value } : state.delta });
  }
  const delta = state.delta;
  useEffect(() => {
    if (!delta) return;
    const t = setTimeout(() => setState((s) => (s.delta === delta ? { ...s, delta: null } : s)), 1800);
    return () => clearTimeout(t);
  }, [delta]);
  return delta;
}

/** The display before the search loads: the same shape, dark, with its parts as skeletons. */
export function SearchDisplaySkeleton() {
  return (
    <div className="screen screen-hero p-5 sm:p-8" aria-hidden>
      <Skeleton className="h-3 w-40 bg-screen-dim" />
      <Skeleton className="mt-7 h-8 w-3/4 max-w-[28rem] bg-screen-dim sm:mt-9" />
      <Skeleton className="mt-4 h-3 w-52 bg-screen-dim" />
      <div className="mt-6 flex gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className="h-2.5 flex-1 rounded-[1px] bg-screen-dim" />
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-screen-dim pt-5 sm:mt-8 sm:grid-cols-4 sm:pt-7">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-3">
            <Skeleton className="h-3 w-20 bg-screen-dim" />
            <Skeleton className="h-9 w-20 bg-screen-dim sm:h-11" />
          </div>
        ))}
      </div>
    </div>
  );
}
