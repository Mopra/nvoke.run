import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'none';

/** A grade or verdict: a colored dot and a word, as in the app's badges. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const dot = {
    good: 'bg-chart-1',
    warn: 'bg-chart-2',
    bad: 'bg-destructive',
    info: 'bg-chart-3',
    none: 'bg-muted-foreground/45',
  }[tone];
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-2 rounded-full bg-foreground/[0.06] pr-3 pl-2.5 text-[13px] font-medium text-foreground/85">
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      {children}
    </span>
  );
}
