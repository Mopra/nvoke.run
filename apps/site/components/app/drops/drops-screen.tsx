'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import { Inbox, Plus } from 'lucide-react';
import type { Drop, Search } from '@nvoke/shared';
import { DropLed, DropMenu } from '@/components/app/drops/parts';
import { FeedDisplay } from '@/components/app/drops/feed-display';
import { Figure, useArrivals } from '@/components/app/motion';
import { APP_FRAME, APP_INSET, KeyGroup, LedKey } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { RevealHeading } from '@/components/site/home/reveal';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isActive, nextRunLabel, percent, relativeTime } from '@/lib/app/desktop';
import { dropPath, dropRuns, dropState, DROP_STATE_LABEL, dropSummary, NEW_DROP_PATH } from '@/lib/app/drops';
import { useDrops, useSearches } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/*
 * The list is a table with instrument channels for rows, like Searches: the
 * channel number, the drop and what it watches, its state, and the companies
 * it delivered. Hairlines between rows, no boxes. On a phone the state sits
 * under the name.
 */
const GRID =
  'grid grid-cols-[minmax(0,1fr)_auto_28px] items-center gap-x-4 md:grid-cols-[36px_minmax(0,1fr)_200px_110px_28px] lg:grid-cols-[36px_minmax(0,1fr)_240px_120px_28px]';
const ROW =
  'group relative border-t border-border transition-colors duration-200 last:border-b hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]';

/** The state column: the LED and when it runs next, or what it is doing. */
function State({ drop, runs }: { drop: Drop; runs: Search[] }) {
  const state = dropState(drop, runs);
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <DropLed state={state} />
      <span className={cn('cap truncate', state === 'running' || state === 'due' ? 'text-primary' : 'text-muted-foreground')}>
        {state === 'daily' ? nextRunLabel(drop) : DROP_STATE_LABEL[state]}
      </span>
    </div>
  );
}

/** A delivering row's top hairline turns into its run's progress, as on Searches. */
function RunRule({ run }: { run: Search }) {
  const queued = run.status === 'queued';
  const share = queued ? 6 : Math.max(3, percent(run.companiesCrawled, Math.max(run.limit, run.companiesFound, 1)));
  return (
    <span
      aria-hidden
      className={cn(
        'absolute -top-px left-0 h-0.5 bg-primary shadow-[0_0_8px_var(--primary)] transition-[width] duration-700 ease-out-soft motion-reduce:transition-none',
        queued && 'motion-safe:animate-pulse',
      )}
      style={{ width: `${share}%` }}
    />
  );
}

function DropRow({ drop, runs, index, style }: { drop: Drop; runs: Search[]; index: number; style?: CSSProperties }) {
  const live = runs.find((r) => isActive(r.status));
  const detail = [dropSummary(drop), drop.lastDeliveredAt ? `delivered ${relativeTime(drop.lastDeliveredAt)}` : null].filter(Boolean).join(' · ');
  return (
    <div style={style} className={ROW}>
      {live && <RunRule run={live} />}
      <Link href={dropPath(drop.id)} aria-label={drop.name} data-drop-enabled={drop.enabled} className="absolute inset-0 outline-none" />
      <div className={cn('pointer-events-none relative py-4', APP_INSET, GRID)}>
        <span className="cap hidden text-muted-foreground md:block">{String(index + 1).padStart(2, '0')}</span>
        <div className="min-w-0">
          <div className="truncate font-display text-base" title={drop.name}>
            {drop.name}
          </div>
          <div className="mt-1 truncate font-mono text-[12px] tracking-[0.04em] text-muted-foreground uppercase" title={detail}>
            {detail}
          </div>
          <div className="mt-2 md:hidden">
            <State drop={drop} runs={runs} />
          </div>
        </div>
        <div className="hidden md:block">
          <State drop={drop} runs={runs} />
        </div>
        <div
          className={cn(
            'text-right font-display text-3xl font-light tracking-[-0.02em] tabular-nums transition-colors duration-500',
            live && 'text-primary',
          )}
        >
          <Figure value={drop.companiesDelivered} />
        </div>
        <div className="pointer-events-auto -mr-1 flex justify-end">
          <DropMenu drop={drop} />
        </div>
      </div>
    </div>
  );
}

function TableHead() {
  return (
    <div className={cn(GRID, 'cap hidden pb-2 text-muted-foreground md:grid', APP_INSET)}>
      <span>Ch</span>
      <span>Drop</span>
      <span>Next run</span>
      <span className="text-right">Delivered</span>
      <span />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className={cn('border-t border-border py-5 last:border-b', APP_INSET, GRID)}>
          <Skeleton className="hidden h-3 w-5 md:block" />
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-72 max-w-full" />
          </div>
          <Skeleton className="hidden h-3 w-28 md:block" />
          <Skeleton className="ml-auto h-7 w-12" />
          <span />
        </div>
      ))}
    </div>
  );
}

function NewDropKey() {
  return (
    <KeyGroup label="Drop">
      <LedKey>
        <Button asChild variant="dark">
          <Link href={NEW_DROP_PATH}>
            <Plus />
            New drop
          </Link>
        </Button>
      </LedKey>
    </KeyGroup>
  );
}

export function DropsScreen() {
  const { data, error, isPending, refetch } = useDrops();
  const searches = useSearches();
  const drops = data?.drops ?? [];
  const arrive = useArrivals(drops.map((d) => d.id));
  const live = drops.filter((d) => {
    const state = dropState(d, dropRuns(searches.data, d.id));
    return state === 'running' || state === 'due';
  }).length;

  return (
    <main className={cn(APP_FRAME, 'app-view pb-24')}>
      <div className={cn(APP_INSET, 'flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-8 pb-5')}>
        <div className="flex items-start gap-3">
          <RevealHeading as="h1" lines={['Drops']} className="font-display text-3xl font-light tracking-[-0.02em] sm:text-4xl" />
          {drops.length > 0 && (
            <span className="cap pt-1 text-muted-foreground">
              {drops.length}
              {live > 0 && <span className="text-primary"> / {live} live</span>}
            </span>
          )}
        </div>
        {drops.length > 0 && <NewDropKey />}
      </div>
      {!error && <FeedDisplay data={data} searches={searches.data} className="mb-10 sm:mb-14" />}
      {isPending ? (
        <>
          <TableHead />
          <ListSkeleton />
        </>
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : drops.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No drops yet"
          action={
            <Button asChild size="lg" variant="dark">
              <Link href={NEW_DROP_PATH}>
                <Plus />
                New drop
              </Link>
            </Button>
          }
        >
          A drop watches new launches for you. Once a day the new ones that match land in Searches, crawled and verified.
        </EmptyState>
      ) : (
        <>
          <TableHead />
          <section className="stagger flex flex-col">
            {drops.map((d, i) => (
              <DropRow key={d.id} drop={d} runs={dropRuns(searches.data, d.id)} index={i} style={arrive(d.id)} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
