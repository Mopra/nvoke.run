/**
 * Light and dark mode. The user picks system, light or dark (stored locally);
 * system follows the OS. Applied by toggling the `dark` class on <html>, and
 * mirrored to the main process so the OS side (menus, dialogs) matches.
 */
import { useSyncExternalStore } from 'react';
import { syncThemeSource } from './chrome';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const KEY = 'nvoke.theme';
const listeners = new Set<() => void>();
let preference: ThemePreference = 'system';
let resolved: ResolvedTheme = 'light';
let snapshot: { preference: ThemePreference; resolved: ResolvedTheme } = { preference, resolved };

function media(): MediaQueryList {
  return window.matchMedia('(prefers-color-scheme: dark)');
}

function apply(): void {
  resolved = preference === 'system' ? (media().matches ? 'dark' : 'light') : preference;
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
  snapshot = { preference, resolved };
  for (const l of listeners) l();
}

export function initTheme(): void {
  const stored = localStorage.getItem(KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') preference = stored;
  syncThemeSource(preference);
  apply();
  media().addEventListener('change', () => {
    if (preference === 'system') apply();
  });
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;
  localStorage.setItem(KEY, next);
  syncThemeSource(next);
  apply();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { preference: ThemePreference; resolved: ResolvedTheme } {
  return useSyncExternalStore(subscribe, () => snapshot);
}
