import { release } from 'node:os';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  type BrowserWindowConstructorOptions,
} from 'electron';
import {
  IpcChannel,
  type TitleBarColors,
  type WindowChrome,
  type WindowState,
} from '../ipc/contract';
import {
  DEFAULT_SIZE,
  MIN_SIZE,
  isThemeSource,
  readSavedWindow,
  restorableBounds,
  writeSavedWindow,
  type SavedWindow,
} from './window-state';

/**
 * The frameless main window. Native controls stay native: traffic lights on
 * macOS, the Window Controls Overlay caption buttons on Windows and Linux.
 * The renderer draws everything else and marks drag regions in CSS.
 */

const MAC_TITLE_BAR = 52;
const OVERLAY_TITLE_BAR = 48;
/** Centers the traffic lights in the 52px sidebar header. */
const TRAFFIC_LIGHTS = { x: 18, y: 19 };

/**
 * Paint colors before the renderer has loaded, so the window never flashes
 * white in dark mode. The renderer replaces the caption button colors with
 * the real theme values as soon as it starts (see setTitleBarColors).
 */
const BOOT_COLORS = {
  light: { background: '#f6f6f8', symbol: '#1d1d22' },
  dark: { background: '#1a1a1d', symbol: '#ececf0' },
};

const HEX = /^#[0-9a-f]{6}$/i;

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

/** Mica needs Windows 11, build 22000 or later. */
function supportsMica(): boolean {
  if (process.platform !== 'win32') return false;
  const build = Number(release().split('.')[2]);
  return Number.isFinite(build) && build >= 22000;
}

function chromeFor(): Pick<WindowChrome, 'platform' | 'material' | 'controls' | 'titleBarHeight'> {
  switch (process.platform) {
    case 'darwin':
      return { platform: 'darwin', material: 'vibrancy', controls: 'traffic-lights', titleBarHeight: MAC_TITLE_BAR };
    case 'win32':
      return {
        platform: 'win32',
        material: supportsMica() ? 'mica' : 'none',
        controls: 'overlay',
        titleBarHeight: OVERLAY_TITLE_BAR,
      };
    case 'linux':
      return { platform: 'linux', material: 'none', controls: 'overlay', titleBarHeight: OVERLAY_TITLE_BAR };
    default:
      return { platform: 'other', material: 'none', controls: 'overlay', titleBarHeight: OVERLAY_TITLE_BAR };
  }
}

function bootColors(): { background: string; symbol: string } {
  return nativeTheme.shouldUseDarkColors ? BOOT_COLORS.dark : BOOT_COLORS.light;
}

function platformOptions(chrome: ReturnType<typeof chromeFor>): BrowserWindowConstructorOptions {
  const boot = bootColors();
  if (chrome.platform === 'darwin') {
    return {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: TRAFFIC_LIGHTS,
      vibrancy: 'sidebar',
      visualEffectState: 'followWindow',
      // Transparent so the sidebar material shows through the page.
      backgroundColor: '#00000000',
    };
  }
  const overlay = { color: boot.background, symbolColor: boot.symbol, height: chrome.titleBarHeight };
  if (chrome.material === 'mica') {
    return {
      titleBarStyle: 'hidden',
      titleBarOverlay: { ...overlay, color: '#00000000' },
      backgroundMaterial: 'mica',
      backgroundColor: '#00000000',
    };
  }
  return { titleBarStyle: 'hidden', titleBarOverlay: overlay, backgroundColor: boot.background };
}

function windowState(win: BrowserWindow): WindowState {
  return { focused: win.isFocused(), fullscreen: win.isFullScreen(), maximized: win.isMaximized() };
}

let saved: SavedWindow = {};

export function loadWindowPreferences(): void {
  saved = readSavedWindow(stateFile());
  if (saved.theme) nativeTheme.themeSource = saved.theme;
}

export function createMainWindow(): BrowserWindow {
  const chrome = chromeFor();
  const bounds = restorableBounds(
    saved.bounds,
    screen.getAllDisplays().map((d) => d.workArea),
  );

  const win = new BrowserWindow({
    ...(bounds ?? DEFAULT_SIZE),
    center: !bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    autoHideMenuBar: true,
    title: 'nvoke',
    ...platformOptions(chrome),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (saved.maximized) win.maximize();

  // Remember where the window was. Normal bounds, so a maximized window
  // restores to its previous size when unmaximized next launch.
  let timer: NodeJS.Timeout | undefined;
  const persist = (): void => {
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    saved = { ...saved, bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    writeSavedWindow(stateFile(), saved);
  };
  const schedule = (): void => {
    clearTimeout(timer);
    timer = setTimeout(persist, 400);
  };
  win.on('resize', schedule);
  win.on('move', schedule);
  win.on('close', () => {
    clearTimeout(timer);
    persist();
  });

  const push = (): void => {
    if (!win.isDestroyed()) win.webContents.send(IpcChannel.windowStateChanged, windowState(win));
  };
  win.on('focus', push);
  win.on('blur', push);
  win.on('maximize', push);
  win.on('unmaximize', push);
  win.on('enter-full-screen', push);
  win.on('leave-full-screen', push);

  return win;
}

/** IPC for the window chrome. Every handler validates its input. */
export function registerWindowIpc(): void {
  ipcMain.handle(IpcChannel.windowGetChrome, (event): WindowChrome => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return {
      ...chromeFor(),
      theme: nativeTheme.themeSource,
      state: win ? windowState(win) : { focused: true, fullscreen: false, maximized: false },
    };
  });

  ipcMain.handle(IpcChannel.windowSetTheme, (_event, theme: unknown) => {
    if (!isThemeSource(theme)) throw new Error('theme must be system, light or dark');
    nativeTheme.themeSource = theme;
    saved = { ...saved, theme };
    writeSavedWindow(stateFile(), saved);
  });

  ipcMain.handle(IpcChannel.windowSetTitleBarColors, (event, colors: unknown) => {
    const c = colors as Partial<TitleBarColors> | null;
    // `transparent` lets the caption buttons sit clear over Mica.
    const clear = c?.color === 'transparent';
    if (!c || typeof c.color !== 'string' || typeof c.symbolColor !== 'string' || !(clear || HEX.test(c.color)) || !HEX.test(c.symbolColor)) {
      throw new Error('title bar colors must be #rrggbb or transparent');
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || process.platform === 'darwin') return;
    win.setTitleBarOverlay({ color: clear ? '#00000000' : c.color, symbolColor: c.symbolColor, height: chromeFor().titleBarHeight });
  });
}
