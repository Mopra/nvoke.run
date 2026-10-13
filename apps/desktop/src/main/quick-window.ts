import { join } from 'node:path';
import { app, BrowserWindow, globalShortcut, ipcMain, screen, type WebContents } from 'electron';
import { DEFAULT_HOTKEY, isAccelerator } from '../ipc/accelerator';
import { IpcChannel } from '../ipc/contract';
import { clampQuickHeight, hotkeyClashMessage, isRouteHash, quickBounds, QUICK_MIN_HEIGHT, QUICK_WIDTH } from './quick-geometry';

/**
 * The quick window: a small frameless glass command bar that a global shortcut
 * opens over whatever app is in front, Spotlight or Raycast style. It loads the
 * same renderer on `#/quick` and reuses the command bar there. Esc, a click
 * elsewhere or the shortcut again hides it.
 */

export interface QuickOptions {
  /** Shows the main window on a route hash (`#/searches/ID`). */
  openInMain(hash: string): void;
  /** True when no shortcut should be registered, for example during a capture run. */
  disabled?: boolean;
}

export class QuickWindow {
  private win: BrowserWindow | null = null;
  private height = QUICK_MIN_HEIGHT;
  private hotkey = DEFAULT_HOTKEY;
  private registered = false;
  /** Why the shortcut is not active. Null when it is registered. */
  error: string | null = null;

  constructor(private readonly options: QuickOptions) {}

  /** The accelerator the user chose, whether or not it registered. */
  get accelerator(): string {
    return this.hotkey;
  }

  /** Starts with the saved shortcut. A clash is kept in `error` for Account to show. */
  init(accelerator: string | undefined): void {
    this.hotkey = accelerator && isAccelerator(accelerator) ? accelerator : DEFAULT_HOTKEY;
    if (this.options.disabled) return;
    this.registered = this.tryRegister(this.hotkey);
    this.error = this.registered ? null : hotkeyClashMessage(this.hotkey);
  }

  /** Registers `accelerator`. On a clash the shortcut in use stays and `error` says why. */
  setHotkey(accelerator: string): boolean {
    if (this.options.disabled) return true;
    if (accelerator === this.hotkey && this.registered) return true;
    if (this.tryRegister(accelerator)) {
      if (this.registered) globalShortcut.unregister(this.hotkey);
      this.hotkey = accelerator;
      this.registered = true;
      this.error = null;
      return true;
    }
    this.error = hotkeyClashMessage(accelerator);
    return false;
  }

  private tryRegister(accelerator: string): boolean {
    try {
      return globalShortcut.register(accelerator, () => this.toggle());
    } catch {
      return false;
    }
  }

  registerIpc(): void {
    // Only the quick window may drive itself.
    const fromQuick = (sender: WebContents): boolean => !!this.win && !this.win.isDestroyed() && sender === this.win.webContents;

    ipcMain.on(IpcChannel.quickHide, (event) => {
      if (fromQuick(event.sender)) this.hide();
    });
    ipcMain.on(IpcChannel.quickOpenInMain, (event, hash: unknown) => {
      if (!fromQuick(event.sender) || !isRouteHash(hash)) return;
      this.hide(false);
      this.options.openInMain(hash);
    });
    ipcMain.on(IpcChannel.quickSetHeight, (event, height: unknown) => {
      if (!fromQuick(event.sender) || typeof height !== 'number' || !Number.isFinite(height)) return;
      this.height = clampQuickHeight(height);
      if (this.win && !this.win.isDestroyed() && this.win.isVisible()) this.place();
    });
  }

  destroy(): void {
    globalShortcut.unregisterAll();
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
  }

  toggle(): void {
    if (this.win?.isVisible()) this.hide();
    else this.show();
  }

  show(): void {
    const win = this.ensureWindow();
    this.place();
    win.webContents.send(IpcChannel.quickShown);
    win.show();
    win.focus();
  }

  /**
   * Hides the window. Windows and Linux hand focus back to the app that was in
   * front by themselves. On macOS nvoke hides itself, unless it is about to
   * show its main window.
   */
  hide(returnFocus = true): void {
    if (!this.win || this.win.isDestroyed() || !this.win.isVisible()) return;
    this.win.hide();
    if (returnFocus && process.platform === 'darwin' && !BrowserWindow.getAllWindows().some((w) => w !== this.win && w.isVisible())) {
      app.hide();
    }
  }

  private place(): void {
    if (!this.win) return;
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    this.win.setBounds(quickBounds(display.workArea, QUICK_WIDTH, this.height));
  }

  private ensureWindow(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      width: QUICK_WIDTH,
      height: QUICK_MIN_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      title: 'nvoke quick search',
      backgroundColor: '#00000000',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    // Above full screen apps too, like Spotlight.
    win.setAlwaysOnTop(true, 'pop-up-menu');
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.on('blur', () => this.hide(false));
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== win.webContents.getURL()) event.preventDefault();
    });
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#/quick`);
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/quick' });
    this.win = win;
    return win;
  }
}
