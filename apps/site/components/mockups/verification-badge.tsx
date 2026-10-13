import { cn } from '@/lib/utils';

export type Verification = 'valid' | 'risky' | 'catch_all' | 'invalid' | 'unknown';

export const verificationInfo: Record<Verification, { label: string; dot: string; tint: string; meaning: string }> = {
  valid: {
    label: 'Valid',
    dot: 'bg-chart-1',
    tint: 'bg-chart-1/15',
    meaning: 'The mail server confirmed the mailbox exists.',
  },
  catch_all: {
    label: 'Catch-all',
    dot: 'bg-chart-3',
    tint: 'bg-chart-3/15',
    meaning: 'The domain accepts mail for any address, so this one cannot be confirmed on its own.',
  },
  risky: {
    label: 'Risky',
    dot: 'bg-chart-2',
    tint: 'bg-chart-2/20',
    meaning: 'The server gave a temporary or unclear answer. It may work, it may bounce.',
  },
  invalid: {
    label: 'Invalid',
    dot: 'bg-destructive',
    tint: 'bg-destructive/12',
    meaning: 'Bad syntax, no mail server, a disposable domain, or the server rejected the mailbox.',
  },
  unknown: {
    label: 'Unknown',
    dot: 'bg-muted-foreground/60',
    tint: 'bg-muted',
    meaning: 'The domain has mail servers, but the mailbox check could not run.',
  },
};

export function VerificationBadge({ status, className }: { status: Verification; className?: string }) {
  const info = verificationInfo[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium text-foreground',
        info.tint,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', info.dot)} />
      {info.label}
    </span>
  );
}
