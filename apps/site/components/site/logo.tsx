import { cn } from '@/lib/utils';

/** The glyph of the mark, shared with the Open Graph image. */
export const LOGO = {
  arch: 'M7 15V11a5 5 0 0 1 10 0v4',
  poles: 'M7 16.3v3.2M17 16.3v3.2',
  lead: { cx: 12, cy: 16.7, r: 1.75 },
  stroke: 3,
};

/**
 * The nvoke mark, as in the desktop app: a lowercase n drawn as a horseshoe
 * magnet, its poles split off, pulling a lead (the dot) in under the arch.
 */
export function LogoMark({
  className,
  motion,
}: {
  className?: string;
  /** Animates the mark (packages/theme/motion.css): a loading loop, a one-off intro, or a hop on hover. */
  motion?: 'loading' | 'intro' | 'hover';
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-primary text-primary-foreground shadow-glow',
        className,
      )}
    >
      <span className="absolute inset-0 bg-linear-to-b from-highlight/40 to-transparent" />
      <svg
        viewBox="0 0 24 24"
        className={cn('relative size-[62%]', motion && `logo-motion logo-${motion}`)}
        fill="none"
      >
        <path className="logo-arch" d={LOGO.arch} stroke="currentColor" strokeWidth={LOGO.stroke} />
        <path className="logo-poles" d={LOGO.poles} stroke="currentColor" strokeWidth={LOGO.stroke} />
        <circle className="logo-lead" {...LOGO.lead} fill="currentColor" />
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
