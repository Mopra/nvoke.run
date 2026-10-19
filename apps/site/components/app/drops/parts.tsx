'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, MoreHorizontal, Pause, Play, RotateCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Drop, Search } from '@nvoke/shared';
import { Figure, METER_SEGMENTS, ScreenMeter } from '@/components/mockups/parts';
import { ghostFor, useCountUp } from '@/components/app/searches/count';
import { useTicker } from '@/components/site/home/motion';
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
import { formatNumber, percent } from '@/lib/app/desktop';
import { dropPath, DROPS_PATH, type DropState } from '@/lib/app/drops';
import { useDeleteDrop, useRunDrop, useUpdateDrop } from '@/lib/app/queries';
import { cn } from '@/lib/utils';

/**
 * A drop's LED: orange and blinking while it delivers or checks, green
 * between runs, dark when paused. `screen` picks the unlit color for a
 * black display instead of the paper.
 */
export function DropLed({ state, screen = false, className }: { state: DropState; screen?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'led',
        state === 'running' || state === 'due'
          ? 'led-on motion-safe:animate-blink'
          : state === 'daily'
            ? 'bg-chart-1 shadow-[0_0_6px_var(--chart-1)]'
            : screen
              ? 'bg-screen-dim'
              : 'bg-muted-foreground/35',
        className,
      )}
    />
  );
}

/** A lit figure over its ghost digits, counting up; dark until its value is in. */
export function Count({ value, widest, className }: { value: number | null; widest: number; className?: string }) {
  const shown = useCountUp(value);
  return (
    <Figure
      value={shown === null ? '' : formatNumber(shown)}
      ghost={ghostFor(formatNumber(Math.max(widest, value ?? 0)))}
      className={className}
    />
  );
}

/**
 * A run on a display: solid segments are companies read, dim ones companies
 * found. A queued run has nothing to show yet, so a dim sweep runs while it
 * waits, and so does `sweep` (a drop checking for launches).
 */
export function RunMeter({ run, sweep = false, className }: { run?: Search; sweep?: boolean; className?: string }) {
  const waiting = sweep || !run || run.status === 'queued';
  const tick = useTicker(140, waiting, METER_SEGMENTS) % (METER_SEGMENTS + 1);
  if (waiting || !run) return <ScreenMeter lit={0} dim={tick} className={className} />;
  const scale = Math.max(run.limit, run.companiesFound, 1);
  const lit = Math.round((percent(run.companiesCrawled, scale) / 100) * METER_SEGMENTS);
  const dim = Math.round((percent(run.companiesFound, scale) / 100) * METER_SEGMENTS);
  return <ScreenMeter lit={lit} dim={Math.max(dim, lit + 1)} className={className} />;
}

/** Check now, pause or resume, each with its toast. */
export function useDropActions(drop: Drop) {
  const update = useUpdateDrop();
  const run = useRunDrop();

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
      onSuccess: () => toast('Checking for new launches', { description: 'Anything new lands within a minute.' }),
      onError: (err) => toast.error('Couldn’t run the drop', { description: err.message }),
    });
  }

  return { togglePaused, runNow, toggling: update.isPending, running: run.isPending };
}

export function DeleteDropDialog({
  drop,
  open,
  onOpenChange,
  leave = false,
}: {
  drop: Drop;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Go back to the drops list once it is gone (from the drop's own page). */
  leave?: boolean;
}) {
  const remove = useDeleteDrop();
  const router = useRouter();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {drop.name}?</AlertDialogTitle>
          <AlertDialogDescription>No more daily leads from it. The searches it already delivered stay in Searches.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              remove.mutate(drop.id, {
                onSuccess: () => {
                  toast.success('Drop deleted', { description: drop.name });
                  if (leave) router.replace(DROPS_PATH);
                },
                onError: (err) => toast.error('Couldn’t delete the drop', { description: err.message }),
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const MENU_TRIGGER =
  'pointer-events-auto text-muted-foreground sm:pointer-fine:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100';

/** A drop row's menu: open, check now, pause or resume, delete. */
export function DropMenu({ drop }: { drop: Drop }) {
  const [confirm, setConfirm] = useState(false);
  const { togglePaused, runNow, toggling, running } = useDropActions(drop);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${drop.name}`} className={MENU_TRIGGER}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={dropPath(drop.id)}>
              <ArrowUpRight />
              Open
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={runNow} disabled={running}>
            <RotateCw />
            Check now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={togglePaused} disabled={toggling}>
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
      <DeleteDropDialog drop={drop} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}
