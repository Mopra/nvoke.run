import { cn } from '@/lib/utils';

/** The nvoke mark: a window with a search line and three result rows. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-6', className)}>
      <rect x="2" y="3" width="20" height="18" rx="4.5" className="fill-primary" />
      <rect x="5.5" y="7" width="13" height="2.2" rx="1.1" className="fill-primary-foreground" />
      <circle cx="6.6" cy="12.6" r="1.1" className="fill-ring" />
      <rect x="9" y="11.8" width="9.5" height="1.6" rx="0.8" className="fill-primary-foreground/70" />
      <circle cx="6.6" cy="16.4" r="1.1" className="fill-ring" />
      <rect x="9" y="15.6" width="6.5" height="1.6" rx="0.8" className="fill-primary-foreground/70" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
      <LogoMark />
      nvoke
    </span>
  );
}
