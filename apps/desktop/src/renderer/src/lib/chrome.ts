/**
 * The frameless window's chrome as the renderer sees it. Sets data attributes
 * on <html> that the CSS reads:
 * - `data-platform`: darwin, win32, linux or web (a plain browser).
 * - `data-material` and `data-controls`: always none; the window is a
 *   solid chassis with no native controls.
 * - `data-focused`, `data-fullscreen`, `data-maximized`: live window state.
 *
 * Works without the bridge (VITE_MOCK in a browser): it guesses the platform
 * from the user agent and leaves the material off.
 */
import type { ThemePreference } from './theme';
import type { WindowApi, WindowState } from '../../../ipc/contract';

function windowApi(): WindowApi | null {
  const api = (window as unknown as { nvoke?: { window?: WindowApi } }).nvoke?.window;
  return api && typeof api.getChrome === 'function' ? api : null;
}

function guessPlatform(): string {
  const ua = navigator.userAgent;
  if (/Mac/.test(ua)) return 'darwin';
  if (/Windows/.test(ua)) return 'win32';
  if (/Linux/.test(ua)) return 'linux';
  return 'web';
}

const root = document.documentElement;

function applyState(state: WindowState): void {
  root.dataset['focused'] = String(state.focused);
  root.dataset['fullscreen'] = String(state.fullscreen);
  root.dataset['maximized'] = String(state.maximized);
}

export async function initChrome(): Promise<void> {
  const api = windowApi();
  const isElectron = /Electron/.test(navigator.userAgent);
  if (!api) {
    const platform = isElectron ? guessPlatform() : 'web';
    root.dataset['platform'] = platform;
    root.dataset['material'] = 'none';
    root.dataset['controls'] = 'none';
    applyState({ focused: true, fullscreen: false, maximized: false });
    return;
  }
  const info = await api.getChrome();
  root.dataset['platform'] = info.platform;
  root.dataset['material'] = info.material;
  root.dataset['controls'] = info.controls;
  root.style.setProperty('--titlebar-height', `${info.titleBarHeight}px`);
  applyState(info.state);
  api.onStateChange(applyState);
}

/** Closes the window. nvoke stays in the tray; in a plain browser this does nothing. */
export function closeWindow(): void {
  void windowApi()?.close().catch(() => undefined);
}

/** Tells the main process which appearance to use, so the material follows. */
export function syncThemeSource(preference: ThemePreference): void {
  void windowApi()?.setTheme(preference).catch(() => undefined);
}
