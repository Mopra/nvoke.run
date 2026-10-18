/**
 * Motion helpers for lists and figures. The keyframes live in
 * packages/theme/motion.css (`stagger`, `animate-item-in`).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { formatNumber } from '@/lib/format';

/** How long the first paint of a list may stagger before new rows come in at once. */
const SETTLE_MS = 700;

/**
 * The style for each child of a `stagger` list. On the first paint the rows
 * cascade by index; after that a row that arrives (a new search, a key just
 * made) comes in at once, wherever it lands. Rows already shown never replay:
 * they keep their keys, so React keeps their elements. A list where rows
 * change as you type drops `stagger` once `settled`, so only the opening
 * cascades.
 */
export function useStagger(): { settled: boolean; style: (index: number) => CSSProperties } {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, []);
  return { settled, style: (index) => ({ '--i': settled ? 0 : index }) as CSSProperties };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * A figure that glides to its new value instead of jumping: progress counts
 * while a search runs. The first value shows as is, so a screen never counts
 * up from zero on open. Under reduced motion it jumps.
 */
export function useCountUp(value: number, ms = 700): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const shownRef = useRef(value);
  useEffect(() => {
    if (value === shownRef.current) return;
    if (prefersReducedMotion() || Math.abs(value - shownRef.current) < 1) {
      shownRef.current = value;
      setShown(value);
      return;
    }
    from.current = shownRef.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const t = Math.min(1, (now - start) / ms);
      // Ease out: quick at first, settling on the value.
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(from.current + (value - from.current) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [value, ms]);
  return shown;
}

/** A formatted figure that glides between values (useCountUp). */
export function CountUp({ value }: { value: number }) {
  return <>{formatNumber(useCountUp(value))}</>;
}
