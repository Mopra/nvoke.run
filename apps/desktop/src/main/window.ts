import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  screen,
  type BrowserWindowConstructorOptions,
} from 'electron';
import { IpcChannel, type WindowChrome, type WindowState } from '../ipc/contract';
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
 * The frameless main window. No native controls on any platform: the
 * renderer draws the device, its power nub closes the window (to the tray),
 * a double click on the drag region maximizes it and the edges resize it.
 */

const TITLE_BAR = 36;

/**
 * Paint the chassis before the renderer has loaded, so the window never
 * flashes white in dark mode. The values follow packages/theme/field.css.
 */
const BOOT_COLORS = {
  light: '#dcdbd6',
  dark: '#262625',
};

function stateFile(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

function chromeFor(): Pick<WindowChrome, 'platform' | 'material' | 'controls' | 'titleBarHeight'> {
  const platform = process.platform === 'darwin' || process.platform === 'win32' || process.platform === 'linux' ? process.platform : 'other';
  return { platform, material: 'none', controls: 'none', titleBarHeight: TITLE_BAR };
}

function platformOptions(): BrowserWindowConstructorOptions {
  return {
    frame: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? BOOT_COLORS.dark : BOOT_COLORS.light,
  };
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
    ...platformOptions(),
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

  ipcMain.handle(IpcChannel.windowClose, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  });
}
