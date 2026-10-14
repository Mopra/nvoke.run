import { join } from 'node:path';
import { app, BrowserWindow } from 'electron';
import { IpcChannel, type AuthState, type DesktopCommand, type DesktopSettings, type UpdateState } from '../ipc/contract';
import type { AuthSession } from './auth/session';
import { readSavedDesktop, writeSavedDesktop, type SavedDesktop } from './desktop-settings';

/** What features tell each other through the context, in the order they registered. */
export interface MainEvents {
  /** The sign-in state changed. */
  auth: AuthState;
  /** The saved session was read at launch. Fires once, before queued sign-in links are handled. */
  started: AuthState;
  /** The renderer deleted a search through the API bridge. */
  'search-deleted': string;
  /** The main window was created and its page is loading. */
  window: BrowserWindow;
  /** The updater's state changed. */
  update: UpdateState;
  /** The tray asked to restart into the downloaded update. */
  'install-update': null;
}

type Listener<T> = (payload: T) => void;

/**
 * The state the main process features share. Each feature registers itself
 * from its own file in `features/` with this context; `index.ts` only calls
 * those register functions.
 */
export class MainContext {
  readonly env: { apiUrl: string; siteUrl: string };
  /** Dev only: the folder `--capture` writes to, or null in a normal run. */
  readonly captureDir: string | null;
  mainWindow: BrowserWindow | null = null;

  private authSession: AuthSession | null = null;
  private saved: SavedDesktop | null = null;
  private readonly listeners: { [K in keyof MainEvents]?: Listener<MainEvents[K]>[] } = {};
  private readonly quitters: (() => void)[] = [];
  private readonly settingsParts: (() => Partial<DesktopSettings>)[] = [];

  constructor(opts: { env: { apiUrl: string; siteUrl: string }; captureDir: string | null }) {
    this.env = opts.env;
    this.captureDir = opts.captureDir;
  }

  /** The signed-in session. Set by the auth feature when the app is ready, before any other feature registers. */
  get session(): AuthSession {
    if (!this.authSession) throw new Error('the auth session is not ready yet');
    return this.authSession;
  }

  set session(session: AuthSession) {
    this.authSession = session;
  }

  /** The session exists and holds a device token. */
  signedIn(): boolean {
    return this.authSession?.getState().status === 'signed-in';
  }

  on<K extends keyof MainEvents>(event: K, listener: Listener<MainEvents[K]>): void {
    const list = (this.listeners[event] ??= []) as Listener<MainEvents[K]>[];
    list.push(listener);
  }

  emit<K extends keyof MainEvents>(event: K, payload: MainEvents[K]): void {
    for (const listener of (this.listeners[event] ?? []) as Listener<MainEvents[K]>[]) listener(payload);
  }

  /** Runs on `will-quit`, the last registered first. */
  onQuit(listener: () => void): void {
    this.quitters.push(listener);
  }

  quit(): void {
    for (const listener of this.quitters.splice(0).reverse()) listener();
  }

  /** What the app keeps in `userData/desktop-settings.json`, read on first use. */
  get desktop(): SavedDesktop {
    return (this.saved ??= readSavedDesktop(this.desktopFile()));
  }

  saveDesktop(patch: SavedDesktop): void {
    this.saved = { ...this.desktop, ...patch };
    writeSavedDesktop(this.desktopFile(), this.saved);
  }

  private desktopFile(): string {
    return join(app.getPath('userData'), 'desktop-settings.json');
  }

  /** A feature adds its fields of `DesktopSettings`. */
  provideSettings(part: () => Partial<DesktopSettings>): void {
    this.settingsParts.push(part);
  }

  /** Every feature's fields, as `desktop:get-settings` and the setters answer. */
  settings(): DesktopSettings {
    return Object.assign({}, ...this.settingsParts.map((part) => part())) as DesktopSettings;
  }

  focusWindow(): void {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }

  /** Shows the window and hands the renderer a command, for example from the tray. */
  sendCommand(command: DesktopCommand): void {
    this.focusWindow();
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;
    if (win.webContents.isLoading()) win.webContents.once('did-finish-load', () => win.webContents.send(IpcChannel.desktopCommand, command));
    else win.webContents.send(IpcChannel.desktopCommand, command);
  }

  /** Sends to the main window once its page has loaded. False when it could not. */
  sendToMain(channel: string, payload: unknown): boolean {
    const win = this.mainWindow;
    if (!win || win.isDestroyed() || win.webContents.isLoading()) return false;
    win.webContents.send(channel, payload);
    return true;
  }

  /** Sends to every window: the main window, the quick window and the grab overlay. */
  broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
  }
}
