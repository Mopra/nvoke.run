'use client';

import { Check } from 'lucide-react';
import { VerificationBadge } from '@/components/mockups/primitives';
import { useTimeline } from '@/components/mockups/use-timeline';
import { cn } from '@/lib/utils';

// The checks nvoke runs on one address, in order, with example output.
const STEPS = [
  { name: 'Syntax', detail: 'Well formed address' },
  { name: 'Mail servers', detail: 'MX mx1.example-mail.com, mx2.example-mail.com' },
  { name: 'Disposable domains', detail: 'Not on the disposable list' },
  { name: 'Mailbox', detail: 'RCPT TO accepted with 250 OK, then QUIT' },
  { name: 'Catch-all', detail: 'A random address on the domain was rejected' },
];

// Step k of the scene: the first k checks have passed. Plays once on view.
const DURATIONS = [700, ...STEPS.map((_, i) => (i === 3 ? 820 : 440))];

/** One address and the conversation with its mail server, as an inset grouped list. */
export function VerificationTrace({ className }: { className?: string }) {
  const { ref, step } = useTimeline(DURATIONS);
  const done = step;
  return (
    <div ref={ref} className={cn('flex flex-col gap-2', className)}>
      <div className="glass-strong overflow-hidden rounded-[28px] text-card-foreground">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-7 py-5">
          <span className="font-mono text-sm">emma@eastsidedental.com</span>
          {done >= STEPS.length ? (
            <VerificationBadge key="valid" value="valid" className="mock-badge-in" />
          ) : (
            <VerificationBadge key="checking" value="checking" />
          )}
        </div>
        <ol className="flex flex-col py-3">
          {STEPS.map((step, i) => (
            <li key={step.name} className="relative flex gap-4 px-7 py-3">
              {i < STEPS.length - 1 ? (
                <span aria-hidden="true" className="absolute top-9 -bottom-3 left-[39px] w-px bg-border" />
              ) : null}
              <span
                className={cn(
                  'mock-check relative flex size-6 shrink-0 items-center justify-center rounded-full',
                  i < done ? 'bg-chart-1/15 text-chart-1' : 'bg-foreground/[0.05] text-transparent',
                )}
              >
                {i === done ? (
                  <span className="size-1.5 rounded-full bg-primary/70 motion-safe:animate-skeleton" />
                ) : (
                  <Check key={i < done ? 'on' : 'off'} className={cn('size-3.5', i < done && 'mock-badge-in')} strokeWidth={2.5} />
                )}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{step.name}</span>
                <span
                  className={cn(
                    'mock-check text-sm break-words',
                    i < done ? 'text-muted-foreground' : 'text-muted-foreground/40',
                  )}
                >
                  {step.detail}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="px-7 pt-2 text-xs text-muted-foreground">
        Nothing is sent. We hang up before the server would take a message.
      </p>
    </div>
  );
}
