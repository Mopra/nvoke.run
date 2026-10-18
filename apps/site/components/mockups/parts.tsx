import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The small parts the site's demos are built from, the same as the desktop's
 * (docs/design/manual.md, "The parts"): lit dot matrix figures with ghost
 * segments behind them, the 16 segment meter, LEDs. They sit on a `screen`.
 */

/**
 * A figure on a screen: the lit value in Doto, right aligned over ghost
 * segments ("888" under "34"). `ghost` sets the unlit pattern, so the width
 * never jumps while the figure counts.
 */
export function Figure({ value, ghost, className }: { value: ReactNode; ghost: string; className?: string }) {
  return (
    <span className={cn('relative inline-block text-right leading-none whitespace-nowrap', className)}>
      <span aria-hidden="true" className="ghost">
        {ghost}
      </span>
      <span className="lcd absolute inset-y-0 right-0">{value}</span>
    </span>
  );
}

export const METER_SEGMENTS = 16;

/**
 * The meter on a screen: 16 square segments lit orange from the left. `dim`
 * segments (found, not yet read) glow faintly between the lit and the off.
 */
export function ScreenMeter({ lit, dim = 0, className }: { lit: number; dim?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex gap-[2px]', className)}>
      {Array.from({ length: METER_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 min-w-0 flex-1 rounded-[1px] bg-screen-dim transition-colors duration-300 motion-reduce:transition-none',
            i < lit && 'bg-primary shadow-[0_0_6px_var(--primary)]',
            i >= lit && i < dim && 'bg-primary/35',
          )}
        />
      ))}
    </span>
  );
}

/** A labelled figure: the cap above, the figure under it. */
export function Readout({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <span className="cap text-screen-foreground/50">{label}</span>
      {children}
    </div>
  );
}
