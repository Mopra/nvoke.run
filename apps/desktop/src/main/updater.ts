import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, shell } from 'electron';
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater';
import type { UpdateState } from '../ipc/contract';

/**
 * Updates from GitHub Releases through electron-updater. Windows (NSIS) and
 * Linux (AppImage) download in the background and install on the next quit,
 * or by themselves once the window has been hidden in the tray for a while,
 * coming back hidden. macOS builds are unsigned and Squirrel.Mac refuses
 * those, so there the app only says a version is out and opens its dmg.
 * docs/desktop/updates.md.
 */

/** Where the releases live. electron-builder.yml `publish` names the same repository. */
export const RELEASES = { owner: 'Mopra', repo: 'nvoke.run' } as const;

const FIRST_CHECK_MS = 30_000;
const CHECK_EVERY_MS = 4 * 60 * 60_000;
/** A ready update installs by itself once the window has stayed hidden this long. */
const HIDDEN_INSTALL_MS = 10 * 60_000;
/** How long the hidden relaunch marker counts, so a stale one never hides a normal start. */
const MARKER_MAX_AGE_MS = 15 * 60_000;

function markerFile(): string {
  return join(app.getPath('userData'), 'update-relaunch.json');
}

/** True once, on the start that follows a hidden install. Removes the marker. */
export function relaunchedHidden(): boolean {
  try {
    const { at } = JSON.parse(readFileSync(markerFile(), 'utf8')) as { at?: unknown };
    rmSync(markerFile(), { force: true });
    return typeof at === 'number' && Date.now() - at < MARKER_MAX_AGE_MS;
  } catch {
    return false;
  }
}

/** Unsigned macOS builds cannot install updates. A Linux deb or tarball has nothing to replace. */
export function canInstallItself(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): boolean {
  if (platform === 'win32') return true;
  if (platform === 'linux') return !!env['APPIMAGE'];
  return false;
}

/** The dmg for this Mac, as electron-builder.yml's artifactName names it. */
export function macDownloadUrl(version: string, arch: string): string {
  const tag = `v${version}`;
  return `https://github.com/${RELEASES.owner}/${RELEASES.repo}/releases/download/${tag}/nvoke-${version}-mac-${arch}.dmg`;
}

export interface UpdaterOptions {
  /** False in development and capture runs: nothing to update. */
  enabled: boolean;
  /** Whether the main window is on screen. A ready update waits while it is. */
  windowVisible(): boolean;
  onChange(state: UpdateState): void;
}

export class Updater {
  private state: UpdateState;
  private readonly installs: boolean;
  private hiddenTimer: NodeJS.Timeout | null = null;
  private interval: NodeJS.Timeout | null = null;

  constructor(private readonly options: UpdaterOptions) {
    const current = app.getVersion();
    const supported = options.enabled && (process.platform === 'darwin' || canInstallItself(process.platform, process.env));
    this.installs = supported && canInstallItself(process.platform, process.env);
    this.state = { status: supported ? 'idle' : 'unsupported', current, version: null, percent: null, checkedAt: null, error: null };
    if (!supported) return;

    autoUpdater.autoDownload = this.installs;
    autoUpdater.autoInstallOnAppQuit = this.installs;
    autoUpdater.allowPrerelease = current.includes('-');
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking', error: null }));
    autoUpdater.on('update-not-available', () => this.set({ status: 'idle', version: null, checkedAt: Date.now() }));
    autoUpdater.on('update-available', (info: UpdateInfo) =>
      this.set({ status: this.installs ? 'downloading' : 'available', version: info.version, percent: 0, checkedAt: Date.now() }),
    );
    autoUpdater.on('download-progress', (progress: ProgressInfo) => this.set({ status: 'downloading', percent: Math.round(progress.percent) }));
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.set({ status: 'ready', version: info.version, percent: null });
      this.windowHidden();
    });
    autoUpdater.on('error', (err: Error) => {
      // A failed check or download is retried on the next round. Keep a ready update ready.
      if (this.state.status === 'ready') return;
      console.warn(`[updates] ${err.message}`);
      this.set({ status: 'error', percent: null, checkedAt: Date.now(), error: firstLine(err.message) });
    });
  }

  getState(): UpdateState {
    return this.state;
  }

  start(): void {
    if (this.state.status === 'unsupported') return;
    setTimeout(() => this.check(), FIRST_CHECK_MS);
    this.interval = setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  check(): UpdateState {
    const busy = this.state.status === 'checking' || this.state.status === 'downloading' || this.state.status === 'ready';
    if (this.state.status === 'unsupported' || busy) return this.state;
    autoUpdater.checkForUpdates().catch(() => undefined);
    return this.state;
  }

  /** Restarts into the ready update, or on macOS opens the new dmg in the browser. */
  async install({ hidden = false } = {}): Promise<void> {
    const { status, version } = this.state;
    if (status === 'available' && version) {
      await shell.openExternal(macDownloadUrl(version, process.arch));
      return;
    }
    if (status !== 'ready') return;
    if (hidden) {
      try {
        writeFileSync(markerFile(), JSON.stringify({ at: Date.now() }));
      } catch {
        // Without the marker the app comes back with its window open. Fine.
      }
    }
    // Silent installer, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  /** The window was hidden (or the update became ready). Installs if it stays hidden. */
  windowHidden(): void {
    if (this.state.status !== 'ready' || this.options.windowVisible()) return;
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.hiddenTimer = setTimeout(() => {
      this.hiddenTimer = null;
      if (!this.options.windowVisible()) void this.install({ hidden: true });
    }, HIDDEN_INSTALL_MS);
  }

  stop(): void {
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    if (this.interval) clearInterval(this.interval);
  }

  private set(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }
}

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? '').slice(0, 200);
}
