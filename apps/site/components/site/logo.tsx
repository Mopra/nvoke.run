import { cn } from '@/lib/utils';

/** The glyph path of the mark, shared with the Open Graph image. */
export const LOGO_PATH = 'M7 18.5V11a5 5 0 0 1 10 0v7.5';
export const LOGO_SPARK = { cx: 18.6, cy: 5.4, r: 1.7 };

/**
 * The nvoke mark, as in the desktop app: a lowercase n drawn as one stroke,
 * with a spark at its shoulder (the moment a search is invoked).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-primary text-primary-foreground shadow-glow',
        className,
      )}
    >
      <span className="absolute inset-0 bg-linear-to-b from-highlight/40 to-transparent" />
      <svg viewBox="0 0 24 24" className="relative size-[62%]" fill="none">
        <path d={LOGO_PATH} stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        <circle {...LOGO_SPARK} fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.02em]', className)}>
      <LogoMark className="size-[22px]" />
      nvoke
    </span>
  );
}
