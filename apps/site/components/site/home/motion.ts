'use client';

import { useEffect, useRef, useState } from 'react';

/** True while the element is in view, or from the first time it is with `once`. */
export function useInView<T extends Element>(margin = '0px 0px -15% 0px', once = false) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const seen = Boolean(entry?.isIntersecting);
        setInView(seen);
        if (seen && once) io.disconnect();
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, once]);
  return [ref, inView] as const;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A tick counter that runs every `ms` while `running` and the tab is visible.
 * Under reduced motion it jumps to `still` and stays there.
 */
export function useTicker(ms: number, running: boolean, still: number) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTick(still);
      return;
    }
    if (!running) return;
    const id = window.setInterval(() => {
      if (!document.hidden) setTick((t) => t + 1);
    }, ms);
    return () => window.clearInterval(id);
  }, [ms, running, still]);
  return tick;
}
