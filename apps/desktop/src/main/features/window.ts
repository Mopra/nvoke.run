import { join } from 'node:path';
import { app, shell } from 'electron';
import type { MainContext } from '../context';
import { isSafeExternalUrl } from '../external-url';
import { startedHidden } from '../login-item';
import { relaunchedHidden } from '../updater';
import { createMainWindow, loadWindowPreferences, registerWindowIpc } from '../window';

/** The main window's IPC and lifecycle. Open it with `openMainWindow` once every feature has registered. */
export function registerWindow(ctx: MainContext): void {
  registerWindowIpc();
  loadWindowPreferences();

  // Registered once the session is read, so a launch at login stays hidden.
  ctx.on('started', () => {
    app.on('activate', () => {
      if (!ctx.mainWindow || ctx.mainWindow.isDestroyed()) openMainWindow(ctx, { hidden: false });
      else ctx.focusWindow();
    });
  });

  // The window only closes for real on quit, and then the app is on its way out.
  app.on('window-all-closed', () => {
    if (ctx.captureDir || process.platform !== 'darwin') app.quit();
  });
}

/**
 * Creates the main window. Started at login, or back from an update that
 * installed while the window was hidden, it stays in the tray until the user
 * opens it.
 */
export function openMainWindow(ctx: MainContext, { hidden = !ctx.captureDir && (relaunchedHidden() || startedHidden(process.argv)) } = {}): void {
  const win = createMainWindow();
  ctx.mainWindow = win;

  if (!hidden) win.once('ready-to-show', () => win.show());

  // Never open new Electron windows from content. Links go to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // Block navigation away from the app's own page.
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  ctx.emit('window', win);
}
