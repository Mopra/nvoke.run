import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type Tone = 'good' | 'warn' | 'bad' | 'info' | 'none';

/** A grade or verdict: an LED and a printed word, as on the app's panel. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  const dot = {
    good: 'bg-chart-1',
    warn: 'bg-chart-2',
    bad: 'bg-destructive',
    info: 'bg-chart-3',
    none: '',
  }[tone];
  return (
    <span className="cap inline-flex shrink-0 items-center gap-2 text-foreground">
      <span className={cn('led', dot)} aria-hidden="true" />
      {children}
    </span>
  );
}
