/**
 * The look: how the app is styled, on top of light or dark. "Calm" is the
 * default canvas. "Field" is the instrument panel: warm grey chassis, signal
 * orange, keycaps, a black display strip and small mono labels. Stored
 * locally and applied as `data-look` on <html>, which the `field:` variant
 * and the token blocks in packages/theme/theme.css follow.
 */
import { useSyncExternalStore } from 'react';
import { syncTitleBar } from './chrome';

export type Look = 'calm' | 'field';

export const LOOKS: Look[] = ['calm', 'field'];
export const DEFAULT_LOOK: Look = 'calm';

const KEY = 'nvoke.look';
const listeners = new Set<() => void>();
let look: Look = DEFAULT_LOOK;

function isLook(value: unknown): value is Look {
  return typeof value === 'string' && (LOOKS as string[]).includes(value);
}

function apply(): void {
  if (look === 'calm') delete document.documentElement.dataset['look'];
  else document.documentElement.dataset['look'] = look;
  // The caption buttons follow the canvas colors, which the look changes.
  syncTitleBar();
  for (const l of listeners) l();
}

export function initLook(): void {
  const stored = localStorage.getItem(KEY);
  if (isLook(stored)) look = stored;
  apply();
}

export function setLook(next: Look): void {
  look = next;
  localStorage.setItem(KEY, next);
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLook(): Look {
  return useSyncExternalStore(subscribe, () => look);
}
