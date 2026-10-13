import { cn } from '@/lib/utils';

/**
 * The nvoke mark: a lowercase n drawn as a horseshoe magnet, its poles split
 * off, pulling a lead (the dot) in under the arch. Accent tile, light glyph.
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
        <path d="M7 15V11a5 5 0 0 1 10 0v4M7 16.3v3.2M17 16.3v3.2" stroke="currentColor" strokeWidth="3" />
        <circle cx="12" cy="16.7" r="1.75" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-semibold tracking-[-0.02em]', className)}>nvoke</span>;
}
