'use client';

import { useState } from 'react';
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
  // The LED pops when the check lands while the row is on screen, not on the first paint.
  const state = pending ? 'pending' : value;
  const [first] = useState(state);
  const settled = state !== first;
  const hint = pending ? 'nvoke is checking whether this address receives mail.' : VERIFICATION_HINT[value];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A cap label with its LED, printed on the chassis. */}
        <span
          className={cn(
            'cap inline-flex h-[18px] shrink-0 cursor-default items-center gap-2',
            value === 'invalid' && !pending ? 'text-muted-foreground' : 'text-foreground/75',
          )}
        >
          <span
            key={state}
            className={cn('led', pending ? 'bg-primary/70 motion-safe:animate-pulse' : VERIFICATION_DOT[value], settled && 'motion-safe:animate-pop-in')}
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

/** An LED, lit and blinking while the search runs. The one-property color utilities win over `led`. */
export function StatusDot({ status, className }: { status: SearchStatus; className?: string }) {
  const live = status === 'running' || status === 'queued';
  return <span className={cn('led', STATUS_DOT[status], live && 'led-on motion-safe:animate-blink', className)} />;
}

export function StatusLabel({ status }: { status: SearchStatus }) {
  return (
    <span className="cap inline-flex items-center gap-2 text-muted-foreground">
      <StatusDot status={status} />
      {STATUS_LABEL[status]}
    </span>
  );
}
