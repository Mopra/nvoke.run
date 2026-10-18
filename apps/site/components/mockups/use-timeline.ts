'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A scripted scene for a mockup: step through `durations` (how long each step
 * holds, in ms) while the element is on screen. It pauses off screen, rewinds
 * silently if it starts off screen, and does nothing once a play-once scene
 * ends, so it costs nothing at rest. Under prefers-reduced-motion it shows
 * `still` (the last step unless given) and never moves.
 *
 * The server renders `ssr` (`still` unless given), so the first frame is a
 * whole picture for anyone without script.
 */
export function useTimeline<T extends HTMLElement = HTMLDivElement>(
  durations: readonly number[],
  {
    loop = false,
    still,
    ssr,
    threshold = 0.35,
  }: { loop?: boolean; still?: number; ssr?: number; threshold?: number } = {},
) {
  const last = durations.length - 1;
  const rest = still ?? last;
  const ref = useRef<T>(null);
  const [step, setStep] = useState(ssr ?? rest);
  const start = useRef(ssr ?? rest);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let current = start.current;
    let visible = false;
    let first = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const go = (s: number) => {
      current = s;
      setStep(s);
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!visible) return;
      if (current >= last && !loop) return;
      timer = setTimeout(() => {
        go(current >= last ? 0 : current + 1);
        schedule();
      }, durations[current] ?? 0);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (first) {
          first = false;
          if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            go(rest);
            io.disconnect();
            return;
          }
          // Off screen at load: rewind now, so it plays from the top on arrival.
          if (!entry.isIntersecting) go(0);
        }
        visible = entry.isIntersecting;
        schedule();
      },
      { threshold },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [durations, last, rest, loop, threshold]);

  return { ref, step };
}

/** Steps that type `text` one character at a time: step i shows i + 1 characters. */
export function typing(text: string, ms = 85): { text: string; ms: number }[] {
  return Array.from(text, (_, i) => ({ text: text.slice(0, i + 1), ms: ms + ((i * 37) % 3) * 18 }));
}
