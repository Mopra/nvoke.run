'use client';

import { useEffect, useState } from 'react';

/**
 * The rows that arrived while the search was live: keys not on screen before,
 * after the first batch. The first load and rows a filter brings back are not
 * fresh; only rows a poll found are.
 */
export function useFresh(keys: readonly string[], live: boolean): ReadonlySet<string> {
  const sig = keys.join('\n');
  const [state, setState] = useState<{ sig: string; seen: ReadonlySet<string>; fresh: ReadonlySet<string> }>({
    sig: '',
    seen: new Set(),
    fresh: new Set(),
  });
  if (state.sig === sig) return state.fresh;
  const first = state.seen.size === 0;
  const seen = new Set(state.seen);
  const fresh = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    if (!first && live) fresh.add(k);
  }
  setState({ sig, seen, fresh });
  return fresh;
}

/** True for a moment after a fresh row mounts, so it lights up and then settles. */
export function useFlash(fresh: boolean, ms = 2200): boolean {
  const [lit, setLit] = useState(fresh);
  useEffect(() => {
    if (!lit) return;
    const t = setTimeout(() => setLit(false), ms);
    return () => clearTimeout(t);
  }, [lit, ms]);
  return lit;
}

/** The classes of a row lighting up: an orange edge and a warm wash that fade as it settles. */
export const FLASH_ROW = 'bg-primary/[0.07] shadow-[inset_2px_0_0_var(--primary)]';
