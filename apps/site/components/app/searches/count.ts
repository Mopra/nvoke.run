'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/components/site/home/motion';

/**
 * A figure for a screen that counts up from zero the first time it has a
 * value, then glides to each new one (a poll moving a count reads as
 * progress). `null` holds it dark until the data is in. Reduced motion
 * shows the value at once.
 */
export function useCountUp(value: number | null, ms = 900): number | null {
  const [shown, setShown] = useState<number | null>(null);
  const current = useRef(0);
  useEffect(() => {
    if (value === null) return;
    const from = current.current;
    const span = prefersReducedMotion() || from === value ? 0 : ms;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number): void => {
      const t = span === 0 ? 1 : Math.min(1, (now - start) / span);
      const next = t >= 1 ? value : Math.round(from + (value - from) * (1 - (1 - t) ** 3));
      current.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

/** The unlit pattern behind a figure: one 8 per digit of the widest value it will show, at least `min`. */
export function ghostFor(widest: string, min = 3): string {
  const ghost = widest.replace(/\d/g, '8');
  return ghost.length >= min ? ghost : '8'.repeat(min - ghost.length) + ghost;
}
