import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatNumber, isActive, percent } from '@/lib/format';
import { ghostOf, useCountUp } from '@/lib/motion';
import type { Search } from '@/lib/types';
import { progressCaption } from '@/components/SearchProgress';
import { Skeleton } from '@/components/ui/skeleton';

const SEGMENTS = 16;

/**
 * A search on one display, as the web app's results show it: the status LED
 * with WAIT, RUN and DONE printed beside it, what the pipeline is doing, the
 * 16 segment meter and the four figures over their ghost digits. Smaller than
 * the web app's: the device's display strip above stays the big screen, so
 * this one carries no title. While the search runs the LED blinks, the next
 * segment flickers and a figure glides up with a `+n` as it grows.
 */
export function SearchDisplay({ search, className }: { search: Search; className?: string }) {
  const active = isActive(search.status);
  const running = search.status === 'running';
  const queued = search.status === 'queued';
  const watching = !active && Boolean(search.ongoing);
  const note = active
    ? progressCaption(search)
    : watching
      ? 'Watching for new companies'
      : search.status === 'failed'
        ? 'Stopped on an error'
        : search.status === 'canceled'
          ? 'Stopped, results kept'
          : `${formatNumber(search.companiesCrawled)} of ${formatNumber(search.companiesFound)} websites read`;

  // The scale is the limit while companies are still being found, then the number found.
  const scale = active ? Math.max(search.limit, search.companiesFound, 1) : Math.max(search.companiesFound, 1);
  const lit = Math.min(SEGMENTS, Math.round((percent(search.companiesCrawled, scale) / 100) * SEGMENTS));
  const dim = Math.min(SEGMENTS, Math.round((percent(search.companiesFound, scale) / 100) * SEGMENTS));
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  const ghost = ghostOf(Math.max(search.limit, search.companiesFound, search.emailsFound));
  const last = search.status === 'failed' ? 'Failed' : search.status === 'canceled' ? 'Stopped' : 'Done';

  return (
    <section
      aria-label="Progress"
      data-search-display
      data-status={search.status}
      className={cn('screen relative overflow-hidden rounded-[6px] px-5 pt-4 pb-5', className)}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={cn(
            'led bg-screen-dim transition-colors duration-500',
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
        <span
          key={note}
          role="status"
          aria-live="polite"
          data-stage-note
          className="cap ml-auto min-w-0 truncate text-right tabular-nums text-screen-foreground/50 motion-safe:animate-fade-in"
          title={note}
        >
          {note}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label="Companies crawled"
        aria-valuemin={0}
        aria-valuemax={scale}
        aria-valuenow={search.companiesCrawled}
        className="mt-4 flex gap-[2px]"
      >
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={cn(
              'h-2 min-w-0 flex-1 rounded-[1px] bg-screen-dim transition-[background-color,box-shadow] duration-500 motion-reduce:transition-none',
              queued && i < 3 && 'bg-screen-foreground/40 motion-safe:animate-pulse',
              !queued && i < lit && (running ? 'bg-primary shadow-[0_0_6px_var(--primary)]' : meterTone(search.status)),
              !queued && i >= lit && i < dim && (running ? 'bg-primary/35' : 'bg-screen-foreground/20'),
              // The segment being read flickers while the search runs.
              running && i === lit && lit < SEGMENTS && 'bg-primary/50 motion-safe:animate-blink',
            )}
          />
        ))}
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-x-6 border-t border-screen-dim pt-4">
        <Reading
          label="Companies"
          value={search.companiesFound}
          ghost={ghost}
          live={active || watching}
          sub={search.ongoing ? undefined : `of ${formatNumber(search.limit)}`}
        />
        <Reading label="Websites crawled" value={search.companiesCrawled} ghost={ghost} live={active} />
        <Reading label="Emails found" value={search.emailsFound} ghost={ghost} live={active || watching} />
        <Reading
          label="Valid emails"
          value={search.emailsValid}
          ghost={ghost}
          live={active || watching}
          sub={validShare === null ? undefined : `${validShare}%`}
          subLit
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
  const shown = useCountUp(value);
  const delta = useDelta(value, live);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <dt className="cap flex min-w-0 items-center gap-2 text-screen-foreground/50">
        <span className="truncate">{label}</span>
        {delta && (
          <span key={delta.at} aria-hidden className="tabular-nums text-primary motion-safe:animate-pop-in">
            +{formatNumber(delta.n)}
          </span>
        )}
        {sub && <span className={cn('shrink-0 tabular-nums', subLit ? 'text-primary' : 'text-screen-foreground/70')}>{sub}</span>}
      </dt>
      <dd className="flex">
        <span className="relative inline-block text-[38px] leading-none whitespace-nowrap">
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
export function SearchDisplaySkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('screen rounded-[6px] px-5 pt-4 pb-5', className)}>
      <Skeleton className="h-3 w-40 bg-screen-dim" />
      <div className="mt-4 flex gap-[2px]">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span key={i} className="h-2 flex-1 rounded-[1px] bg-screen-dim" />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-4 gap-x-6 border-t border-screen-dim pt-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-20 bg-screen-dim" />
            <Skeleton className="h-9 w-20 bg-screen-dim" />
          </div>
        ))}
      </div>
    </div>
  );
}
