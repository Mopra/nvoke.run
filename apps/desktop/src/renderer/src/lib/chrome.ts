/**
 * The frameless window's chrome as the renderer sees it. Sets data attributes
 * on <html> that the CSS reads:
 * - `data-platform`: darwin, win32, linux or web (a plain browser).
 * - `data-material`: vibrancy, mica or none. With a material, the page
 *   background is clear and the sidebar is translucent.
 * - `data-controls`: traffic-lights (room top left in the sidebar), overlay
 *   (room top right in the toolbar) or none.
 * - `data-focused`, `data-fullscreen`: live window state.
 *
 * Works without the bridge (VITE_MOCK in a browser): it guesses the platform
 * from the user agent and leaves the material off.
 */
import type { ThemePreference } from './theme';
import type { WindowApi, WindowChrome, WindowState } from '../../../ipc/contract';

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
let chrome: Pick<WindowChrome, 'controls' | 'titleBarHeight'> = { controls: 'traffic-lights', titleBarHeight: 52 };

function applyState(state: WindowState): void {
  root.dataset['focused'] = String(state.focused);
  root.dataset['fullscreen'] = String(state.fullscreen);
}

export async function initChrome(): Promise<void> {
  const api = windowApi();
  const isElectron = /Electron/.test(navigator.userAgent);
  if (!api) {
    const platform = isElectron ? guessPlatform() : 'web';
    root.dataset['platform'] = platform;
    root.dataset['material'] = 'none';
    root.dataset['controls'] = 'none';
    chrome = { controls: 'traffic-lights', titleBarHeight: platform === 'darwin' ? 52 : 48 };
    applyState({ focused: true, fullscreen: false, maximized: false });
    return;
  }
  const info = await api.getChrome();
  chrome = info;
  root.dataset['platform'] = info.platform;
  root.dataset['material'] = info.material;
  root.dataset['controls'] = info.controls;
  root.style.setProperty('--titlebar-height', `${info.titleBarHeight}px`);
  applyState(info.state);
  api.onStateChange(applyState);
  syncTitleBar();
}

/** Tells the main process which appearance to use, so the material follows. */
export function syncThemeSource(preference: ThemePreference): void {
  void windowApi()?.setTheme(preference).catch(() => undefined);
}

/** Resolves any CSS color (oklch included) to #rrggbb through a 1px canvas. */
function toHex(color: string, over: string): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = over;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Paints the Windows and Linux caption buttons in the toolbar's colors. Called
 * on start and whenever light or dark mode changes. No-op on macOS.
 */
export function syncTitleBar(): void {
  const api = windowApi();
  if (!api || chrome.controls !== 'overlay') return;
  const style = getComputedStyle(root);
  const background = style.getPropertyValue('--background').trim();
  const foreground = style.getPropertyValue('--foreground').trim();
  const base = toHex(background, 'gray');
  const symbol = base && toHex(foreground, base);
  if (!base || !symbol) return;
  void api.setTitleBarColors({ color: base, symbolColor: symbol }).catch(() => undefined);
}
