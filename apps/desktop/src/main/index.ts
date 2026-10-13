import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Notification, shell } from 'electron';
import { HealthResponse } from '@nvoke/shared';
import { DEFAULT_HOTKEY, isAccelerator } from '../ipc/accelerator';
import {
  IpcChannel,
  type AppInfo,
  type AuthState,
  type DesktopCommand,
  type DesktopSettings,
  type ExportResult,
  type LocalChange,
} from '../ipc/contract';
import { bridgeRequest, deletedSearchId, exportCsvToFile, safeCsvFileName } from './api-bridge';
import { PROTOCOL, findProtocolUrl } from './auth/flow';
import { AuthSession } from './auth/session';
import { safeTokenStore } from './auth/token-store';
import { captureDirFromArgs, runCapture } from './capture';
import { registerDragIpc } from './drag';
import { registerEnrichedIpc } from './enriched-file';
import { readSavedDesktop, writeSavedDesktop, type SavedDesktop } from './desktop-settings';
import { registerLocalIpc } from './local/ipc';
import { LocalStore } from './local/store';
import { LeadSync } from './local/sync';
import { defaultInboxFolder, InboxWatcher } from './inbox';
import { applyOpenAtLogin, startedHidden } from './login-item';
import { QuickWindow } from './quick-window';
import { registerMcp } from './mcp';
import type { LocalMcpServer } from './mcp/server';
import { AppTray } from './tray';
import { Notifier, registerNotificationIpc } from './notifications/notifier';
import { createMainWindow, loadWindowPreferences, registerWindowIpc } from './window';

const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  siteUrl: import.meta.env.VITE_SITE_URL || (app.isPackaged ? 'https://nvoke.run' : 'http://localhost:3001'),
};

/** Dev only: `--capture[=dir]` screenshots every screen and quits (see capture.ts). */
const captureDir = app.isPackaged ? null : captureDirFromArgs(process.argv, process.env['NVOKE_CAPTURE']);
// A throwaway profile, so captures never touch the real session or window state.
if (captureDir) {
  app.setPath('userData', join(captureDir, '.profile'));
  // A covered window stops painting on Windows, and capturePage then returns a stale frame.
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
}

// One running instance. A second launch (for example the OS opening an
// nvoke:// link on Windows or Linux) hands its argv to the first and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

/** True once the user quits for real. Until then closing the window only hides it. */
let quitting = false;
let tray: AppTray | null = null;
let mainWindow: BrowserWindow | null = null;
let quick: QuickWindow | null = null;
let mcp: LocalMcpServer | null = null;
let notifier: Notifier | null = null;
let desktop: SavedDesktop = {};
let inbox: InboxWatcher | null = null;

function desktopFile(): string {
  return join(app.getPath('userData'), 'desktop-settings.json');
}

function desktopSettings(): DesktopSettings {
  // On by default: the first sign-in saves it as on (see onAuthChange).
  return {
    openAtLogin: desktop.openAtLogin ?? true,
    hotkey: quick?.accelerator ?? desktop.hotkey ?? DEFAULT_HOTKEY,
    hotkeyError: quick?.error ?? null,
    inboxEnabled: desktop.inboxEnabled === true,
    inboxFolder: inboxFolder(),
    inboxError: inbox?.error ?? null,
  };
}

function inboxFolder(): string {
  return desktop.inboxFolder ?? defaultInboxFolder(app.getPath('documents'));
}

/** Starts or stops the watched inbox to match the saved settings. Never in a capture run. */
function applyInbox(): void {
  if (captureDir || !inbox) return;
  if (desktop.inboxEnabled === true) inbox.start(inboxFolder());
  else inbox.stop();
}

function sendToMain(channel: string, payload: unknown): boolean {
  const win = mainWindow;
  if (!win || win.isDestroyed() || win.webContents.isLoading()) return false;
  win.webContents.send(channel, payload);
  return true;
}

function saveDesktop(next: SavedDesktop): void {
  desktop = next;
  writeSavedDesktop(desktopFile(), desktop);
}

function main(): void {
  if (!captureDir) registerProtocol();
  // Windows needs the installer's AppUserModelID for the tray balloon and notifications.
  if (process.platform === 'win32') app.setAppUserModelId('app.nvoke.desktop');

  let session: AuthSession | null = null;
  // Callback URLs that arrive before the app is ready (macOS open-url, or the
  // URL that launched the app on Windows and Linux).
  const queued: string[] = [];
  const launchUrl = findProtocolUrl(process.argv);
  if (launchUrl) queued.push(launchUrl);

  function handleUrl(url: string): void {
    focusWindow();
    if (!session) {
      queued.push(url);
      return;
    }
    void session.handleCallback(url);
  }

  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleUrl(url);
  });

  app.on('second-instance', (_event, argv) => {
    const url = findProtocolUrl(argv);
    if (url) handleUrl(url);
    else focusWindow();
  });

  app.whenReady().then(async () => {
    const store = new LocalStore(join(app.getPath('userData'), 'leads.sqlite'));
    let sync: LeadSync | null = null;
    session = new AuthSession({
      apiUrl: env.apiUrl,
      siteUrl: env.siteUrl,
      deviceName: hostname(),
      tokenStore: safeTokenStore(),
      openExternal: (url) => shell.openExternal(url),
      onChange: (state) => {
        onAuthChange(state);
        // The local copy belongs to the signed-in account: sign out wipes it.
        if (state.status === 'signed-in') sync?.start();
        else if (state.status === 'signed-out') sync?.wipe();
      },
    });
    const api = session;
    desktop = readSavedDesktop(desktopFile());
    // Re-register each launch, so the login item follows the app when it moves.
    if (desktop.openAtLogin) applyOpenAtLogin(true);
    quick = new QuickWindow({
      openInMain: (hash) => sendCommand({ name: 'route', hash }),
      disabled: !!captureDir,
      automationAsked: (browser) => desktop.automationAsked?.includes(browser) ?? false,
      markAutomationAsked: (browser) => {
        if (!desktop.automationAsked?.includes(browser)) {
          saveDesktop({ ...desktop, automationAsked: [...(desktop.automationAsked ?? []), browser] });
        }
      },
    });
    inbox = new InboxWatcher({
      send: (file) => sendToMain(IpcChannel.inboxFile, file),
      notify: ({ title, body, onClick }) => {
        if (!Notification.isSupported()) return;
        const note = new Notification({ title, body });
        if (onClick) note.on('click', onClick);
        note.show();
      },
      signedIn: () => session?.getState().status === 'signed-in',
      reveal: (filePath) => shell.showItemInFolder(filePath),
      focus: focusWindow,
    });
    applyInbox();
    quick.init(desktop.hotkey);
    quick.registerIpc();
    sync = new LeadSync({ client: session, store, onChange: broadcastLocalChange });
    registerIpc(session, sync);
    registerLocalIpc(store, sync);
    notifier = new Notifier(session, () => mainWindow);
    if (!captureDir) registerNotificationIpc(notifier);
    registerWindowIpc();
    registerDragIpc();
    registerEnrichedIpc();
    // Claude Desktop, Claude Code and Cursor reach the signed-in session here.
    mcp = registerMcp({ client: api, signedIn: () => api.getState().status === 'signed-in', listen: !captureDir });
    loadWindowPreferences();
    if (!captureDir) {
      tray = new AppTray({
        open: focusWindow,
        command: sendCommand,
        quit: () => app.quit(),
        fetchSearches: () => (api.getState().status === 'signed-in' ? api.api('/v1/searches') : Promise.resolve(null)),
      });
    }
    createWindow({ hidden: !captureDir && startedHidden(process.argv) });
    await session.init();
    tray?.setSignedIn(session.getState().status === 'signed-in');
    // No token: whatever an earlier run left behind goes.
    if (session.getState().status === 'signed-in') sync.start();
    else sync.wipe();
    if (!captureDir) notifier?.onAuth(session.getState());
    for (const url of queued.splice(0)) await session.handleCallback(url);

    app.on('activate', () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow({ hidden: false });
      else focusWindow();
    });
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', () => {
    tray?.destroy();
    tray = null;
    quick?.destroy();
    quick = null;
    mcp?.close();
    mcp = null;
    inbox?.stop();
    inbox = null;
  });

  // The window only closes for real on quit, and then the app is on its way out.
  app.on('window-all-closed', () => {
    if (captureDir || process.platform !== 'darwin') app.quit();
  });
}

function onAuthChange(state: AuthState): void {
  broadcastAuthState(state);
  notifier?.onAuth(state);
  const signedIn = state.status === 'signed-in';
  tray?.setSignedIn(signedIn);
  if (signedIn) inbox?.retry();
  // The first sign-in turns start at login on. After that it is the user's call.
  if (signedIn && desktop.openAtLogin === undefined) {
    saveDesktop({ ...desktop, openAtLogin: true });
    applyOpenAtLogin(true);
  }
}

/** Shows the window and hands the renderer a command, for example from the tray. */
function sendCommand(command: DesktopCommand): void {
  focusWindow();
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(IpcChannel.desktopCommand, command));
  else win.webContents.send(IpcChannel.desktopCommand, command);
}

/**
 * Registers nvoke:// with the OS. Installers also register it (see
 * `protocols` in electron-builder.yml). In development on Windows the OS has
 * to launch electron.exe with the app path, so pass both.
 */
function registerProtocol(): void {
  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [resolve(process.argv[1])]);
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL);
  }
}

function focusWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function broadcastAuthState(state: AuthState): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.authChanged, state);
}

function broadcastLocalChange(change: LocalChange): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.localChanged, change);
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function createWindow({ hidden }: { hidden: boolean }): void {
  const win = createMainWindow();
  mainWindow = win;

  // Started at login: stay in the tray until the user opens the window.
  if (!hidden) win.once('ready-to-show', () => win.show());

  // Closing keeps nvoke running in the tray, so drops and running searches
  // can still reach the user. Quit from the tray menu (or Cmd+Q) ends it.
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
    if (!desktop.closeHintShown) {
      saveDesktop({ ...desktop, closeHintShown: true });
      tray.notifyStillRunning();
    }
    void tray.refresh();
  });

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

  if (captureDir) void runCapture(win, captureDir);
}

function registerIpc(session: AuthSession, sync: LeadSync): void {
  ipcMain.handle(IpcChannel.getAppInfo, (): AppInfo => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    apiUrl: env.apiUrl,
  }));

  ipcMain.handle(IpcChannel.openExternal, async (_event, url: unknown) => {
    if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
      throw new Error('refused to open a non http(s) url');
    }
    await shell.openExternal(url);
  });

  ipcMain.handle(IpcChannel.getHealth, async () => {
    const res = await session.api('/health');
    if (!res.ok) throw new Error(`/health responded ${res.status}`);
    return HealthResponse.parse(await res.json());
  });

  // The renderer's only door to apps/server. Paths are limited to /v1/ and the
  // device token is attached here, never in the renderer.
  ipcMain.handle(IpcChannel.apiRequest, async (_event, method: unknown, path: unknown, body: unknown) => {
    const res = await bridgeRequest(session, method, path, body);
    const deleted = deletedSearchId(method, path, res);
    if (deleted) sync.deleted(deleted);
    return res;
  });

  ipcMain.handle(IpcChannel.exportCsv, async (event, searchId: unknown, defaultFileName: unknown): Promise<ExportResult> => {
    const options = {
      title: 'Export CSV',
      defaultPath: join(app.getPath('downloads'), safeCsvFileName(defaultFileName)),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (picked.canceled || !picked.filePath) return { saved: false };
    return exportCsvToFile(session, searchId, picked.filePath);
  });

  ipcMain.handle(IpcChannel.desktopGetSettings, (): DesktopSettings => desktopSettings());
  ipcMain.handle(IpcChannel.desktopSetOpenAtLogin, (_event, enabled: unknown): DesktopSettings => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    saveDesktop({ ...desktop, openAtLogin: enabled });
    applyOpenAtLogin(enabled);
    return desktopSettings();
  });

  ipcMain.handle(IpcChannel.desktopSetHotkey, (_event, accelerator: unknown): DesktopSettings => {
    if (!isAccelerator(accelerator)) throw new Error('hotkey must be modifiers plus a key, like CommandOrControl+Shift+Space');
    // A clash keeps the shortcut in use and reports the reason in hotkeyError.
    if (quick?.setHotkey(accelerator) !== false) saveDesktop({ ...desktop, hotkey: accelerator });
    return desktopSettings();
  });

  ipcMain.handle(IpcChannel.desktopSetInboxEnabled, (_event, enabled: unknown): DesktopSettings => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    saveDesktop({ ...desktop, inboxEnabled: enabled });
    applyInbox();
    return desktopSettings();
  });

  ipcMain.handle(IpcChannel.desktopChooseInboxFolder, async (event): Promise<DesktopSettings> => {
    const options = {
      title: 'Choose the inbox folder',
      defaultPath: inboxFolder(),
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    const folder = picked.filePaths[0];
    // A drive or filesystem root is no inbox: its subfolders would be scanned and written to.
    if (picked.canceled || !folder || dirname(folder) === folder) return desktopSettings();
    saveDesktop({ ...desktop, inboxEnabled: true, inboxFolder: folder });
    applyInbox();
    return desktopSettings();
  });

  ipcMain.handle(IpcChannel.desktopOpenInboxFolder, async (): Promise<void> => {
    await shell.openPath(inboxFolder());
  });

  ipcMain.on(IpcChannel.inboxReady, () => inbox?.rendererIsReady());
  ipcMain.handle(IpcChannel.inboxDone, (_event, payload: unknown) => inbox?.done(payload) ?? { saved: false, error: 'The inbox is off.' });
  ipcMain.handle(IpcChannel.inboxFailed, (_event, payload: unknown): void => inbox?.failed(payload));

  ipcMain.handle(IpcChannel.authGetState, () => session.getState());
  ipcMain.handle(IpcChannel.authSignIn, () => session.signIn());
  ipcMain.handle(IpcChannel.authCancel, () => session.cancelSignIn());
  ipcMain.handle(IpcChannel.authSignOut, () => session.signOut());
}
