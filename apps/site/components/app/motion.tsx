'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { LogoMark } from '@/components/site/logo';
import { formatNumber } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';

/**
 * The wait, in the brand: the mark draws itself and pulls its lead in, on a
 * loop. It fades in late (motion-app.css), so a quick load never flashes it.
 * `page` fills a screen's body; without it the loader sits inline.
 */
export function LogoLoader({ label = 'Loading', page = false, className }: { label?: string; page?: boolean; className?: string }) {
  return (
    <div
      role="status"
      className={cn('logo-loader flex flex-col items-center justify-center gap-4', page ? 'min-h-[50vh] py-24' : 'py-10', className)}
    >
      <LogoMark motion="loading" className={page ? 'size-10' : 'size-8'} />
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Stagger for a list that changes under the user (polling, filters, more
 * pages). Rows keep their DOM node across renders, so the `stagger` animation
 * only plays for rows that are new; this hands each one its `--i`: its place
 * in the first batch, then its place among the rows that just arrived, so a
 * row found by a poll comes in at once rather than after the twelfth.
 */
export function useArrivals(keys: readonly string[]): (key: string) => CSSProperties {
  const sig = keys.join('\n');
  const [state, setState] = useState<{ sig: string; order: ReadonlyMap<string, number> }>({ sig: '', order: new Map() });
  let order = state.order;
  if (state.sig !== sig) {
    let arrived = 0;
    order = new Map(keys.map((k) => [k, state.order.get(k) ?? arrived++]));
    setState({ sig, order });
  }
  return (key) => ({ '--i': order.get(key) ?? 0 }) as CSSProperties;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A figure that glides to its new value (about half a second, easing out)
 * instead of jumping, so a poll that moves a count reads as progress. The
 * first value shows as is: nothing counts up from zero on load.
 */
export function useTweened(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const from = current.current;
    if (from === value) return;
    const start = performance.now();
    const span = prefersReducedMotion() ? 0 : ms;
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

/** A number formatted like the rest of the app, gliding between values. */
export function Figure({ value, suffix = '' }: { value: number; suffix?: string }) {
  return (
    <>
      {formatNumber(useTweened(value))}
      {suffix}
    </>
  );
}
