'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/components/site/home/motion';

/**
 * Counts from 0 up to `limit`, one step every `ms` while `running`, then
 * stops. Under reduced motion it starts at `limit`.
 */
export function useRunTo(limit: number, ms: number, running: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setN(limit);
      return;
    }
    if (!running) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setN((t) => {
        if (t + 1 >= limit) window.clearInterval(id);
        return Math.min(limit, t + 1);
      });
    }, ms);
    return () => window.clearInterval(id);
  }, [limit, ms, running]);
  return n;
}

/** A number that glides to `target` instead of jumping, like a figure counting on the screen. */
export function useTween(target: number, ms = 450) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (prefersReducedMotion()) {
      from.current = target;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return;
    }
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      const x = p >= 1 ? target : a + (target - a) * (1 - (1 - p) ** 3);
      from.current = x;
      setValue(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}
