import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { MockSearch, SearchStatus, Verification } from '@/components/mockups/data';
import { cn } from '@/lib/utils';

// Static copies of the desktop app's controls, at the app's own sizes. They
// are pictures: nothing here is focusable or announced, the surrounding
// MockFit carries the description.

/**
 * Draws its child at a fixed design size and scales it to the width it gets,
 * never above 1. Pure CSS (container query units), so the page stays static.
 */
export function MockFit({
  width,
  height,
  label,
  className,
  children,
}: {
  width: number;
  height: number;
  /** What the picture shows, for screen readers. */
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const inner: CSSProperties = {
    width,
    height,
    transform: `scale(min(1, tan(atan2(100cqw, ${width}px))))`,
    transformOrigin: '0 0',
  };
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('mock-fit mx-auto w-full', className)}
      style={{ maxWidth: width, aspectRatio: `${width} / ${height}` }}
    >
      <div aria-hidden="true" inert className="mock absolute top-0 left-0" style={inner}>
        {children}
      </div>
    </div>
  );
}

export const VERIFICATION: Record<Verification, { label: string; dot: string; meaning: string }> = {
  valid: { label: 'Valid', dot: 'bg-chart-1', meaning: 'The mail server confirmed the mailbox exists.' },
  catch_all: {
    label: 'Catch-all',
    dot: 'bg-chart-3',
    meaning: 'The domain accepts mail for any address. This one cannot be confirmed on its own.',
  },
  risky: {
    label: 'Risky',
    dot: 'bg-chart-2',
    meaning: 'The server gave a temporary or unclear answer. It may work, it may bounce.',
  },
  invalid: {
    label: 'Invalid',
    dot: 'bg-destructive',
    meaning: 'Bad syntax, no mail server, a disposable domain, or the server rejected the mailbox.',
  },
  unknown: {
    label: 'Unknown',
    dot: 'bg-muted-foreground/45',
    meaning: 'The domain has mail servers. The mailbox check could not run.',
  },
};

export function VerificationBadge({ value, className }: { value: Verification; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] shrink-0 items-center gap-1.5 rounded-full bg-foreground/[0.05] pr-2 pl-1.5 text-[10.5px] leading-[14px] font-medium',
        value === 'invalid' ? 'text-muted-foreground' : 'text-foreground/75',
        className,
      )}
    >
      <span className={cn('size-1.5 rounded-full', VERIFICATION[value].dot)} />
      {VERIFICATION[value].label}
    </span>
  );
}

const STATUS_DOT: Record<SearchStatus, string> = {
  running: 'bg-primary',
  done: 'bg-chart-1',
  failed: 'bg-destructive',
  canceled: 'bg-muted-foreground/35',
};

export function StatusDot({ status, className }: { status: SearchStatus; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-[7px] shrink-0', className)}>
      {status === 'running' && (
        <span className="absolute -inset-px rounded-full bg-primary opacity-50 motion-safe:animate-ping" />
      )}
      <span className={cn('relative inline-flex size-[7px] rounded-full', STATUS_DOT[status])} />
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[6px] bg-foreground/[0.05] px-1.5 text-[10.5px] font-medium text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The app's pill button, at its desktop size. `primary` carries the glow. */
export function MockButton({
  children,
  icon: Icon,
  variant = 'primary',
  className,
}: {
  children?: ReactNode;
  icon?: LucideIcon;
  variant?: 'primary' | 'glass' | 'ghost';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium whitespace-nowrap',
        variant === 'primary' && 'bg-primary text-primary-foreground shadow-glow',
        variant === 'glass' && 'glass text-foreground/85',
        variant === 'ghost' && 'text-foreground/80',
        Icon && 'pl-3.5',
        className,
      )}
    >
      {Icon && <Icon className="size-4" />}
      {children}
    </span>
  );
}

/** The search pipeline in one bar: found (pale) under crawled (solid). */
export function SearchBar({ search, className }: { search: MockSearch; className?: string }) {
  const active = search.status === 'running';
  return (
    <div className={cn('relative h-1 w-full overflow-hidden rounded-full bg-foreground/[0.07]', className)}>
      <div
        className={cn('absolute inset-y-0 left-0 rounded-full', active ? 'bg-primary/20' : 'bg-foreground/10')}
        style={{ width: `${search.found}%` }}
      />
      <div
        className={cn(
          'absolute inset-y-0 left-0 overflow-hidden rounded-full',
          active && 'bg-primary',
          search.status === 'done' && 'bg-foreground/30',
          search.status === 'failed' && 'bg-destructive/60',
          search.status === 'canceled' && 'bg-foreground/20',
        )}
        style={{ width: `${search.crawled}%` }}
      >
        {active && <div className="progress-sheen absolute inset-0 motion-safe:animate-sheen" />}
      </div>
    </div>
  );
}

/** A segmented control, one option selected. */
export function Segmented({
  options,
  selected,
  className,
}: {
  options: { label: string; icon?: LucideIcon }[];
  selected: number;
  className?: string;
}) {
  return (
    <div className={cn('flex h-8 items-stretch gap-0.5 rounded-full bg-foreground/[0.055] p-[3px]', className)}>
      {options.map((o, i) => (
        <span
          key={o.label}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium whitespace-nowrap',
            i === selected
              ? 'bg-card text-foreground shadow-float dark:bg-foreground/15'
              : 'text-muted-foreground',
          )}
        >
          {o.icon && <o.icon className="size-[15px]" />}
          {o.label}
        </span>
      ))}
    </div>
  );
}
