'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/components/site/home/motion';

/**
 * A figure that counts up from zero the first time `run` is true, then
 * glides to every new value. Under reduced motion it shows the value at once.
 */
export function useCountUp(target: number, run: boolean, ms = 900): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const started = useRef(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return;
    }
    if (!run && !started.current) return;
    started.current = true;
    const a = from.current;
    if (a === target) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const p = Math.min(1, (now - start) / ms);
      const x = p >= 1 ? target : Math.round(a + (target - a) * (1 - (1 - p) ** 3));
      from.current = x;
      setValue(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return value;
}

/** Whole days until the allowance resets on the first of the next month (UTC). Null for a period it cannot read. */
export function daysToReset(period: string, now = Date.now()): number | null {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return null;
  return Math.max(0, Math.ceil((Date.UTC(y, m, 1) - now) / 86_400_000));
}

export const ghostOf = (s: string): string => s.replace(/\d/g, '8');
