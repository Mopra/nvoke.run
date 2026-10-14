import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { app, ipcMain, shell } from 'electron';
import { IpcChannel } from '../../ipc/contract';
import { PROTOCOL, findProtocolUrl } from '../auth/flow';
import { AuthSession } from '../auth/session';
import { safeTokenStore } from '../auth/token-store';
import type { MainContext } from '../context';

export interface AuthFeature {
  /** When the app is ready: creates the session and its IPC. Runs before every other feature. */
  ready(): void;
  /** Reads the saved session, tells the features (`started`) and handles sign-in links that came early. */
  start(): Promise<void>;
}

/**
 * Sign-in through the system browser (docs/SPEC.md, desktop sign-in). Called
 * before the app is ready, so nvoke:// links that arrive early are kept.
 */
export function registerAuth(ctx: MainContext): AuthFeature {
  if (!ctx.captureDir) registerProtocol();

  let session: AuthSession | null = null;
  // Callback URLs that arrive before the app is ready (macOS open-url, or the
  // URL that launched the app on Windows and Linux).
  const queued: string[] = [];
  const launchUrl = findProtocolUrl(process.argv);
  if (launchUrl) queued.push(launchUrl);

  function handleUrl(url: string): void {
    ctx.focusWindow();
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
    else ctx.focusWindow();
  });

  return {
    ready() {
      const created = new AuthSession({
        apiUrl: ctx.env.apiUrl,
        siteUrl: ctx.env.siteUrl,
        deviceName: hostname(),
        tokenStore: safeTokenStore(),
        openExternal: (url) => shell.openExternal(url),
        onChange: (state) => ctx.emit('auth', state),
      });
      ctx.session = created;
      ctx.on('auth', (state) => ctx.broadcast(IpcChannel.authChanged, state));
      ipcMain.handle(IpcChannel.authGetState, () => created.getState());
      ipcMain.handle(IpcChannel.authSignIn, () => created.signIn());
      ipcMain.handle(IpcChannel.authCancel, () => created.cancelSignIn());
      ipcMain.handle(IpcChannel.authSignOut, () => created.signOut());
      session = created;
    },
    async start() {
      const created = ctx.session;
      await created.init();
      ctx.emit('started', created.getState());
      for (const url of queued.splice(0)) await created.handleCallback(url);
    },
  };
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
