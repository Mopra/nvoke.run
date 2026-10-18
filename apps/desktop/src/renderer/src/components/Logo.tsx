import { cn } from '@/lib/utils';

/** How the mark moves (packages/theme/motion.css): a calm loop for a wait, one pull for a first paint, a hop on hover. */
export type LogoMotion = 'loading' | 'intro' | 'hover';

/**
 * The nvoke mark: a lowercase n drawn as a horseshoe magnet, its poles split
 * off, pulling a lead (the dot) in under the arch. Accent tile, light glyph.
 */
export function LogoMark({ className, motion }: { className?: string; motion?: LogoMotion }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[28%] bg-primary text-primary-foreground shadow-glow',
        className,
      )}
    >
      <span className="absolute inset-0 bg-linear-to-b from-highlight/40 to-transparent" />
      <svg viewBox="0 0 24 24" className={cn('relative size-[62%]', motion && `logo-motion logo-${motion}`)} fill="none">
        <path className="logo-arch" d="M7 15V11a5 5 0 0 1 10 0v4" stroke="currentColor" strokeWidth="3" />
        <path className="logo-poles" d="M7 16.3v3.2M17 16.3v3.2" stroke="currentColor" strokeWidth="3" />
        <circle className="logo-lead" cx="12" cy="16.7" r="1.75" fill="currentColor" />
      </svg>
    </span>
  );
}

/**
 * The wait for a screen or a panel: the mark pulling a lead, with an
 * optional line under it. It fades in after a beat, so a quick load never
 * flashes it. Buttons keep their small spinner.
 */
export function LogoLoader({
  label,
  size = 'md',
  className,
}: {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label ?? 'Loading'}
      className={cn(
        'flex flex-col items-center justify-center gap-4 text-center motion-safe:animate-fade-in motion-safe:[animation-delay:180ms]',
        className,
      )}
    >
      <LogoMark motion="loading" className={size === 'sm' ? 'size-7' : size === 'lg' ? 'size-14' : 'size-10'} />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('font-semibold tracking-[-0.02em]', className)}>nvoke</span>;
}
