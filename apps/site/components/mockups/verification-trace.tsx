import { Check } from 'lucide-react';
import { VerificationBadge } from '@/components/mockups/primitives';
import { cn } from '@/lib/utils';

// The checks nvoke runs on one address, in order, with example output.
const STEPS = [
  { name: 'Syntax', detail: 'Well formed address' },
  { name: 'Mail servers', detail: 'MX mx1.example-mail.dk, mx2.example-mail.dk' },
  { name: 'Disposable domains', detail: 'Not on the disposable list' },
  { name: 'Mailbox', detail: 'RCPT TO accepted with 250 OK, then QUIT' },
  { name: 'Catch-all', detail: 'A random address on the domain was rejected' },
];

/** One address and the conversation with its mail server, as an inset grouped list. */
export function VerificationTrace({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-md dark:bg-card/80">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <span className="font-mono text-sm">mette@oesterbrotand.dk</span>
          <VerificationBadge value="valid" />
        </div>
        <ol className="flex flex-col py-1">
          {STEPS.map((step, i) => (
            <li key={step.name} className="relative flex gap-4 px-5 py-3">
              {i < STEPS.length - 1 ? (
                <span aria-hidden="true" className="absolute top-9 -bottom-3 left-[31px] w-px bg-border" />
              ) : null}
              <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-1/15 text-chart-1">
                <Check className="size-3.5" strokeWidth={2.5} />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">{step.name}</span>
                <span className="text-sm break-words text-muted-foreground">{step.detail}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <p className="px-5 text-xs text-muted-foreground">
        No message is sent. The conversation with the mail server ends before any email would be.
      </p>
    </div>
  );
}
