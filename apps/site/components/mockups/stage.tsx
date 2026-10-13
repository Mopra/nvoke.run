import type { ReactNode } from 'react';
import { MockFit } from '@/components/mockups/primitives';
import { cn } from '@/lib/utils';

/**
 * A product shot: an app window scaled to fit, floating over the iris aura.
 * The aura is what shows through the translucent window, standing in for the
 * desktop behind Mica or vibrancy.
 */
export function Stage({
  width,
  height,
  label,
  children,
  className,
  motion = 'reveal',
  halo = 'soft',
}: {
  width: number;
  height: number;
  label: string;
  children: ReactNode;
  className?: string;
  /** `tilt` straightens with the first scroll (the hero), `reveal` rises in once. */
  motion?: 'tilt' | 'reveal' | 'none';
  halo?: 'soft' | 'strong';
}) {
  return (
    <div className={cn('relative', className)}>
      <div
        aria-hidden="true"
        className={cn(
          'aura pointer-events-none absolute -inset-x-[10%] top-[4%] -bottom-[16%] rounded-full',
          halo === 'strong' ? 'opacity-100' : 'opacity-70',
        )}
      />
      <div className={cn(motion === 'tilt' && 'hero-tilt', motion === 'reveal' && 'reveal')}>
        <MockFit width={width} height={height} label={label}>
          {children}
        </MockFit>
      </div>
    </div>
  );
}
