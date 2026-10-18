import { cn } from '@/lib/utils';

/** The glyph of the mark, shared with the Open Graph image. */
export const LOGO = {
  arch: 'M7 15V11a5 5 0 0 1 10 0v4',
  poles: 'M7 16.3v3.2M17 16.3v3.2',
  lead: { cx: 12, cy: 16.7, r: 1.9 },
  stroke: 3,
};

/**
 * The nvoke mark, as in the desktop app (apps/desktop/.../components/Logo.tsx):
 * a lowercase n drawn as a horseshoe magnet pulling a lead (the dot) in under
 * the arch, printed on the orange keycap with its lip and glow. The lead is
 * lit like an LED. Every color is a token.
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
        'key key-primary relative inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-[14%] bg-primary text-primary-foreground',
        className,
      )}
    >
      <span className="absolute inset-0 bg-linear-to-b from-highlight/35 to-transparent" />
      <svg viewBox="0 0 24 24" className={cn('relative size-[66%]', motion && `logo-motion logo-${motion}`)} fill="none">
        <path className="logo-arch" d={LOGO.arch} stroke="currentColor" strokeWidth={LOGO.stroke} strokeLinecap="square" />
        <path className="logo-poles" d={LOGO.poles} stroke="currentColor" strokeWidth={LOGO.stroke} strokeLinecap="square" />
        <circle
          className="logo-lead"
          {...LOGO.lead}
          fill="currentColor"
          style={{ filter: 'drop-shadow(0 0 2px currentColor)' }}
        />
      </svg>
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-display font-light tracking-[-0.01em]', className)}>nvoke</span>;
}

/** Mark and wordmark, as on the desktop's name plate. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-[22px] leading-none', className)}>
      <LogoMark className="size-[26px]" />
      <Wordmark />
    </span>
  );
}
