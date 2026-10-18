import { useState, type CSSProperties } from 'react';
import { Inbox, MoreHorizontal, Pause, Pencil, Play, Plus, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FEED_SOURCES } from '@nvoke/shared';
import { BackButton, DisplayTitle, PageHeader } from '@/components/AppShell';
import { EmptyState, ErrorState } from '@/components/states';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { FEED_SOURCE_LABEL, formatNumber, nextRunLabel, relativeTime, sourcesLabel } from '@/lib/format';
import { useDeleteDrop, useDrops, useRunDrop, useUpdateDrop } from '@/lib/queries';
import { useStagger } from '@/lib/motion';
import { navigate, routeHref } from '@/lib/router';
import type { Drop, FeedSourceStatus } from '@/lib/types';

function DropMenu({ drop }: { drop: Drop }) {
  const [confirm, setConfirm] = useState(false);
  const update = useUpdateDrop();
  const run = useRunDrop();
  const remove = useDeleteDrop();

  function togglePaused(): void {
    update.mutate(
      { id: drop.id, update: { enabled: !drop.enabled } },
      {
        onSuccess: (next) => toast(next.enabled ? 'Drop resumed' : 'Drop paused', { description: next.name }),
        onError: (err) => toast.error('Couldn’t change the drop', { description: err.message }),
      },
    );
  }

  function runNow(): void {
    run.mutate(drop.id, {
      onSuccess: () =>
        toast('Checking for new launches', { description: 'Anything new shows up in Searches within a minute.' }),
      onError: (err) => toast.error('Couldn’t run the drop', { description: err.message }),
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${drop.name}`}
            className="pointer-events-auto text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => navigate({ name: 'drop', id: drop.id })}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={runNow} disabled={run.isPending}>
            <RotateCw />
            Check now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={togglePaused} disabled={update.isPending}>
            {drop.enabled ? <Pause /> : <Play />}
            {drop.enabled ? 'Pause' : 'Resume'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {drop.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              No more daily leads from it. The searches it already delivered stay in Searches.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(drop.id, {
                  onSuccess: () => toast.success('Drop deleted', { description: drop.name }),
                  onError: (err) => toast.error('Couldn’t delete the drop', { description: err.message }),
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DropList({ drops }: { drops: Drop[] }) {
  const stagger = useStagger();
  return (
    <section className="stagger flex flex-col gap-1">
      {drops.map((d, i) => (
        <DropRow key={d.id} drop={d} style={stagger.style(i)} />
      ))}
    </section>
  );
}

function DropRow({ drop, style }: { drop: Drop; style?: CSSProperties }) {
  const what = drop.keyword ? `"${drop.keyword}"` : 'Every launch';
  return (
    <div style={style} className="group relative rounded-[24px] transition-colors duration-200 hover:bg-foreground/[0.035] has-[a:focus-visible]:bg-foreground/[0.05]">
      <a
        href={routeHref({ name: 'drop', id: drop.id })}
        aria-label={drop.name}
        className="absolute inset-0 rounded-[24px] outline-none"
      />
      <div className="pointer-events-none relative flex items-center gap-8 px-6 py-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            {drop.enabled && (
              <span className="relative flex size-2 shrink-0" aria-hidden>
                <span className="size-2 rounded-full bg-primary" />
              </span>
            )}
            <span className="truncate font-display text-lg font-medium">{drop.name}</span>
          </div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {what} from {sourcesLabel(drop.sources, FEED_SOURCES.length)}, up to {formatNumber(drop.dailyLimit)} a day
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground/80">
            {nextRunLabel(drop)}
            {drop.lastDeliveredAt && `. Last delivery ${relativeTime(drop.lastDeliveredAt)}`}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-3xl font-light tabular-nums">{formatNumber(drop.companiesDelivered)}</div>
          <div className="text-xs text-muted-foreground">companies delivered</div>
        </div>
        <div className="pointer-events-auto -mr-2 flex w-7 justify-end">
          <DropMenu drop={drop} />
        </div>
      </div>
    </div>
  );
}

/** What the feed brought in this week, per source. */
function FeedPulse({ sources }: { sources: FeedSourceStatus[] }) {
  const on = sources.filter((s) => s.available);
  const total = on.reduce((sum, s) => sum + s.lastWeek, 0);
  return (
    <p className="text-base text-muted-foreground">
      <span className="tabular-nums">{formatNumber(total)}</span> new launches this week from{' '}
      {on.map((s, i) => (
        <span key={s.source}>
          {i > 0 && (i === on.length - 1 ? ' and ' : ', ')}
          {FEED_SOURCE_LABEL[s.source]} <span className="tabular-nums text-foreground/70">{formatNumber(s.lastWeek)}</span>
        </span>
      ))}
      .
    </p>
  );
}

export function DropsScreen() {
  const { data, error, isPending, refetch } = useDrops();
  const newDrop = (
    <Button variant="glass" className="pr-4 pl-3" onClick={() => navigate({ name: 'drop', id: null })}>
      <Plus className="size-[18px] text-primary" strokeWidth={2.25} />
      New drop
    </Button>
  );

  return (
    <>
      <PageHeader leading={<BackButton />} actions={newDrop} newSearch={false} />
      <main className="fade-edges flex-1 overflow-auto px-8 pb-24">
        <div className="mx-auto max-w-[880px] motion-safe:animate-view-in">
          <DisplayTitle
            className="px-6"
            subtitle={data ? <FeedPulse sources={data.sources} /> : 'Fresh launches, delivered every day.'}
          >
            Drops
          </DisplayTitle>
          {isPending ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2.5 px-6 py-6">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-72" />
                </div>
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : data.drops.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No drops yet"
              action={
                <Button size="lg" onClick={() => navigate({ name: 'drop', id: null })}>
                  <Plus />
                  New drop
                </Button>
              }
            >
              A drop watches new launches for you. Once a day, the new ones that match land in Searches,
              crawled and verified.
            </EmptyState>
          ) : (
            <DropList drops={data.drops} />
          )}
        </div>
      </main>
    </>
  );
}
