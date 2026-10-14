import { app, ipcMain } from 'electron';
import { IpcChannel, type WhatsNew } from '../../ipc/contract';
import changelog from '../../../CHANGELOG.md?raw';
import { compareVersions, notesSince, parseChangelog } from '../changelog';
import type { MainContext } from '../context';
import { Updater } from '../updater';

/**
 * Updates from GitHub Releases, and the What's new card on the first start
 * after one. docs/desktop/updates.md.
 */
export function registerUpdates(ctx: MainContext): void {
  const updater = new Updater({
    enabled: app.isPackaged && !ctx.captureDir,
    windowVisible: () => !!ctx.mainWindow && !ctx.mainWindow.isDestroyed() && ctx.mainWindow.isVisible(),
    onChange: (state) => {
      ctx.broadcast(IpcChannel.updatesChanged, state);
      ctx.emit('update', state);
    },
  });

  const whatsNew = pendingWhatsNew(ctx);

  ipcMain.handle(IpcChannel.updatesGetState, () => updater.getState());
  ipcMain.handle(IpcChannel.updatesCheck, () => updater.check());
  ipcMain.handle(IpcChannel.updatesInstall, () => updater.install());
  ipcMain.handle(IpcChannel.updatesGetWhatsNew, () => whatsNew.current);
  ipcMain.handle(IpcChannel.updatesDismissWhatsNew, () => {
    whatsNew.current = null;
    ctx.saveDesktop({ lastSeenVersion: app.getVersion() });
  });

  ctx.on('install-update', () => void updater.install());
  ctx.on('window', (win) => win.on('hide', () => updater.windowHidden()));
  ctx.onQuit(() => updater.stop());
  updater.start();
}

/**
 * The notes for the versions installed since the user last closed the card.
 * A fresh install has seen nothing to compare with, so it starts at the
 * running version and shows nothing.
 */
function pendingWhatsNew(ctx: MainContext): { current: WhatsNew | null } {
  const version = app.getVersion();
  const seen = ctx.desktop.lastSeenVersion;
  if (ctx.captureDir) return { current: null };
  if (!seen || compareVersions(seen, version) > 0) {
    ctx.saveDesktop({ lastSeenVersion: version });
    return { current: null };
  }
  const notes = notesSince(parseChangelog(changelog), seen, version);
  if (notes.length === 0) {
    if (seen !== version) ctx.saveDesktop({ lastSeenVersion: version });
    return { current: null };
  }
  return { current: { version, notes } };
}
