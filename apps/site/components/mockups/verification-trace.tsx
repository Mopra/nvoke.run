import { Check } from 'lucide-react';
import { VerificationBadge } from '@/components/mockups/verification-badge';
import { cn } from '@/lib/utils';

// The checks nvoke runs on one address, in order, with example output.
const STEPS = [
  { name: 'Syntax', detail: 'Well formed address' },
  { name: 'Mail servers', detail: 'MX mx1.example-mail.dk, mx2.example-mail.dk' },
  { name: 'Disposable domains', detail: 'Not on the disposable list' },
  { name: 'Mailbox', detail: 'RCPT TO accepted with 250 OK, then QUIT' },
  { name: 'Catch-all', detail: 'A random address on the domain was rejected' },
];

export function VerificationTrace({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card text-card-foreground', className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <span className="font-mono text-sm">mette@oesterbrotand.dk</span>
        <VerificationBadge status="valid" />
      </div>
      <ol className="flex flex-col px-5 py-2">
        {STEPS.map((step, i) => (
          <li key={step.name} className="relative flex gap-4 py-3">
            {i < STEPS.length - 1 ? (
              <span aria-hidden="true" className="absolute top-9 bottom-0 left-[11px] w-px bg-border" />
            ) : null}
            <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full bg-chart-1/15 text-foreground">
              <Check className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium">{step.name}</span>
              <span className="text-sm text-muted-foreground">{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="border-t px-5 py-3 text-xs text-muted-foreground">
        No message is sent. The conversation with the mail server ends before any email would be.
      </p>
    </div>
  );
}
