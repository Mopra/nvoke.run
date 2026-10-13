import { cn } from '@/lib/utils';

/**
 * The nvoke mark: a lowercase n drawn as one stroke, with a spark at its
 * shoulder (the moment a search is invoked). Accent tile, light glyph.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-primary text-primary-foreground shadow-glow',
        className,
      )}
    >
      <span className="absolute inset-0 bg-linear-to-b from-highlight/40 to-transparent" />
      <svg viewBox="0 0 24 24" className="relative size-[62%]" fill="none">
        <path d="M7 18.5V11a5 5 0 0 1 10 0v7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="18.6" cy="5.4" r="1.7" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-semibold tracking-[-0.02em]', className)}>nvoke</span>;
}
