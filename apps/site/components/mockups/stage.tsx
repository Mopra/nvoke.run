import type { ReactNode } from 'react';
import { MockFit } from '@/components/mockups/primitives';
import { cn } from '@/lib/utils';

/**
 * A product shot: an app window scaled to fit, floating over a soft iris
 * halo. The halo is what shows through the translucent sidebar, standing in
 * for the desktop behind Mica or vibrancy.
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
          'halo pointer-events-none absolute -inset-x-[8%] top-[6%] -bottom-[14%]',
          halo === 'strong' ? 'opacity-80 dark:opacity-90' : 'opacity-45 dark:opacity-60',
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
