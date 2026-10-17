'use client';

import { cn } from '@/lib/utils';
import { STATUS_LABEL, VERIFICATION_HINT, VERIFICATION_LABEL } from '@/lib/app/desktop';
import type { SearchStatus, Verification } from '@nvoke/shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Dot colors per verification result. Theme tokens only. */
export const VERIFICATION_DOT: Record<Verification, string> = {
  valid: 'bg-chart-1',
  catch_all: 'bg-chart-3',
  risky: 'bg-chart-2',
  invalid: 'bg-destructive',
  unknown: 'bg-muted-foreground/45',
};

export function VerificationBadge({
  value,
  pending = false,
  label: words,
}: {
  value: Verification;
  pending?: boolean;
  /** Other words for the result, like the people view's "Verified" for valid. */
  label?: string;
}) {
  const label = pending ? 'Checking' : (words ?? VERIFICATION_LABEL[value]);
  const hint = pending ? 'nvoke is checking whether this address receives mail.' : VERIFICATION_HINT[value];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex h-[18px] shrink-0 cursor-default items-center gap-1.5 rounded-full bg-foreground/[0.05] pr-2 pl-1.5 text-2xs font-medium',
            value === 'invalid' && !pending ? 'text-muted-foreground' : 'text-foreground/75',
          )}
        >
          <span
            className={cn(
              'size-1.5 rounded-full',
              pending ? 'bg-primary/70 motion-safe:animate-pulse' : VERIFICATION_DOT[value],
            )}
          />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

const STATUS_DOT: Record<SearchStatus, string> = {
  queued: 'bg-muted-foreground/50',
  running: 'bg-primary',
  done: 'bg-chart-1',
  failed: 'bg-destructive',
  canceled: 'bg-muted-foreground/35',
};

export function StatusDot({ status, className }: { status: SearchStatus; className?: string }) {
  const live = status === 'running' || status === 'queued';
  return (
    <span className={cn('relative inline-flex size-[7px] shrink-0', className)}>
      {live && (
        <span className={cn('absolute -inset-px rounded-full opacity-50 motion-safe:animate-ping', STATUS_DOT[status])} />
      )}
      <span className={cn('relative inline-flex size-[7px] rounded-full', STATUS_DOT[status])} />
    </span>
  );
}

export function StatusLabel({ status }: { status: SearchStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
