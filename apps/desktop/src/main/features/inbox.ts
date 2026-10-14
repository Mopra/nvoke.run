import { dirname } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { IpcChannel, type DesktopSettings } from '../../ipc/contract';
import type { MainContext } from '../context';
import { defaultInboxFolder, InboxWatcher } from '../inbox';

/** The watched inbox folder: a CSV put there is enriched in the background. docs/desktop/inbox.md. */
export function registerInbox(ctx: MainContext): void {
  const folder = (): string => ctx.desktop.inboxFolder ?? defaultInboxFolder(app.getPath('documents'));
  let inbox: InboxWatcher | null = new InboxWatcher({
    send: (file) => ctx.sendToMain(IpcChannel.inboxFile, file),
    notify: ({ title, body, onClick }) => {
      if (!Notification.isSupported()) return;
      const note = new Notification({ title, body });
      if (onClick) note.on('click', onClick);
      note.show();
    },
    signedIn: () => ctx.signedIn(),
    reveal: (filePath) => shell.showItemInFolder(filePath),
    focus: () => ctx.focusWindow(),
  });

  /** Starts or stops the watched inbox to match the saved settings. Never in a capture run. */
  function apply(): void {
    if (ctx.captureDir || !inbox) return;
    if (ctx.desktop.inboxEnabled === true) inbox.start(folder());
    else inbox.stop();
  }
  apply();

  ctx.provideSettings(() => ({
    inboxEnabled: ctx.desktop.inboxEnabled === true,
    inboxFolder: folder(),
    inboxError: inbox?.error ?? null,
  }));

  ctx.on('auth', (state) => {
    if (state.status === 'signed-in') inbox?.retry();
  });

  ipcMain.handle(IpcChannel.desktopSetInboxEnabled, (_event, enabled: unknown): DesktopSettings => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    ctx.saveDesktop({ inboxEnabled: enabled });
    apply();
    return ctx.settings();
  });

  ipcMain.handle(IpcChannel.desktopChooseInboxFolder, async (event): Promise<DesktopSettings> => {
    const options = {
      title: 'Choose the inbox folder',
      defaultPath: folder(),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const chosen = picked.filePaths[0];
    // A drive or filesystem root is no inbox: its subfolders would be scanned and written to.
    if (picked.canceled || !chosen || dirname(chosen) === chosen) return ctx.settings();
    ctx.saveDesktop({ inboxEnabled: true, inboxFolder: chosen });
    apply();
    return ctx.settings();
  });

  ipcMain.handle(IpcChannel.desktopOpenInboxFolder, async (): Promise<void> => {
    await shell.openPath(folder());
  });

  ipcMain.on(IpcChannel.inboxReady, () => inbox?.rendererIsReady());
  ipcMain.handle(IpcChannel.inboxDone, (_event, payload: unknown) => inbox?.done(payload) ?? { saved: false, error: 'The inbox is off.' });
  ipcMain.handle(IpcChannel.inboxFailed, (_event, payload: unknown): void => inbox?.failed(payload));

  ctx.onQuit(() => {
    inbox?.stop();
    inbox = null;
  });
}
