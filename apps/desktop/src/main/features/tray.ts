import { app, ipcMain } from 'electron';
import { IpcChannel, type DesktopSettings } from '../../ipc/contract';
import type { MainContext } from '../context';
import { applyOpenAtLogin } from '../login-item';
import { AppTray } from '../tray';

/**
 * nvoke lives in the tray (menu bar on macOS): closing the window only hides
 * it, and the app starts at login, hidden. docs/desktop/tray.md.
 */
export function registerTray(ctx: MainContext): void {
  registerOpenAtLogin(ctx);
  // A capture run quits when its window closes, so it gets no tray.
  if (ctx.captureDir) return;

  const session = ctx.session;
  let tray: AppTray | null = new AppTray({
    open: () => ctx.focusWindow(),
    command: (command) => ctx.sendCommand(command),
    quit: () => app.quit(),
    installUpdate: () => ctx.emit('install-update', null),
    fetchSearches: () => (session.getState().status === 'signed-in' ? session.api('/v1/searches') : Promise.resolve(null)),
  });
  ctx.on('auth', (state) => tray?.setSignedIn(state.status === 'signed-in'));
  ctx.on('started', (state) => tray?.setSignedIn(state.status === 'signed-in'));
  ctx.on('update', (state) => tray?.setUpdate(state));
  ctx.onQuit(() => {
    tray?.destroy();
    tray = null;
  });

  /** True once the user quits for real. Until then closing the window only hides it. */
  let quitting = false;
  app.on('before-quit', () => {
    quitting = true;
  });

  // Closing keeps nvoke running in the tray, so drops and running searches
  // can still reach the user. Quit from the tray menu (or Cmd+Q) ends it.
  ctx.on('window', (win) => {
    // Windows logging off or shutting down must not be held up by a hidden window.
    win.on('session-end', () => {
      quitting = true;
    });
    win.on('close', (event) => {
      if (quitting || !tray) return;
      event.preventDefault();
      if (win.isFullScreen()) {
        win.once('leave-full-screen', () => win.hide());
        win.setFullScreen(false);
      } else {
        win.hide();
      }
      if (!ctx.desktop.closeHintShown) {
        ctx.saveDesktop({ closeHintShown: true });
        tray.notifyStillRunning();
      }
      void tray.refresh();
    });
  });
}

/** Start at login, hidden in the tray. On by default once the user first signs in. */
function registerOpenAtLogin(ctx: MainContext): void {
  // Re-register each launch, so the login item follows the app when it moves.
  if (ctx.desktop.openAtLogin) applyOpenAtLogin(true);

  ctx.provideSettings(() => ({ openAtLogin: ctx.desktop.openAtLogin ?? true }));

  ipcMain.handle(IpcChannel.desktopSetOpenAtLogin, (_event, enabled: unknown): DesktopSettings => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    ctx.saveDesktop({ openAtLogin: enabled });
    applyOpenAtLogin(enabled);
    return ctx.settings();
  });

  // The first sign-in turns start at login on. After that it is the user's call.
  ctx.on('auth', (state) => {
    if (state.status === 'signed-in' && ctx.desktop.openAtLogin === undefined) {
      ctx.saveDesktop({ openAtLogin: true });
      applyOpenAtLogin(true);
    }
  });
}
