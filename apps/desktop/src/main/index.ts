import { hostname } from 'node:os';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { HealthResponse } from '@nvoke/shared';
import { IpcChannel, type AppInfo, type AuthState, type ExportResult } from '../ipc/contract';
import { bridgeRequest, exportCsvToFile, safeCsvFileName } from './api-bridge';
import { PROTOCOL, findProtocolUrl } from './auth/flow';
import { AuthSession } from './auth/session';
import { safeTokenStore } from './auth/token-store';
import { captureDirFromArgs, runCapture } from './capture';
import { registerDragIpc } from './drag';
import { createMainWindow, loadWindowPreferences, registerWindowIpc } from './window';

const env = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  siteUrl: import.meta.env.VITE_SITE_URL || (app.isPackaged ? 'https://nvoke.run' : 'http://localhost:3001'),
};

/** Dev only: `--capture[=dir]` screenshots every screen and quits (see capture.ts). */
const captureDir = app.isPackaged ? null : captureDirFromArgs(process.argv, process.env['NVOKE_CAPTURE']);
// A throwaway profile, so captures never touch the real session or window state.
if (captureDir) app.setPath('userData', join(captureDir, '.profile'));

// One running instance. A second launch (for example the OS opening an
// nvoke:// link on Windows or Linux) hands its argv to the first and quits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  main();
}

function main(): void {
  if (!captureDir) registerProtocol();

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
    session = new AuthSession({
      apiUrl: env.apiUrl,
      siteUrl: env.siteUrl,
      deviceName: hostname(),
      tokenStore: safeTokenStore(),
      openExternal: (url) => shell.openExternal(url),
      onChange: broadcastAuthState,
    });
    registerIpc(session);
    registerWindowIpc();
    registerDragIpc();
    loadWindowPreferences();
    createWindow();
    await session.init();
    for (const url of queued.splice(0)) await session.handleCallback(url);

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
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
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function broadcastAuthState(state: AuthState): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(IpcChannel.authChanged, state);
}

function isSafeExternalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function createWindow(): void {
  const win = createMainWindow();

  win.once('ready-to-show', () => win.show());

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

function registerIpc(session: AuthSession): void {
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
  ipcMain.handle(IpcChannel.apiRequest, (_event, method: unknown, path: unknown, body: unknown) =>
    bridgeRequest(session, method, path, body),
  );

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

  ipcMain.handle(IpcChannel.authGetState, () => session.getState());
  ipcMain.handle(IpcChannel.authSignIn, () => session.signIn());
  ipcMain.handle(IpcChannel.authCancel, () => session.cancelSignIn());
  ipcMain.handle(IpcChannel.authSignOut, () => session.signOut());
}
