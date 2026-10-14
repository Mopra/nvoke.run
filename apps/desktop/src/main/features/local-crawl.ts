import { ipcMain, powerMonitor } from 'electron';
import { IpcChannel, type DesktopSettings } from '../../ipc/contract';
import type { MainContext } from '../context';
import { HiddenBrowser } from '../local-crawl/browser';
import { IDLE_AFTER_S, LocalCrawler } from '../local-crawl';

/** The local render crawl: sites the VPS could not read, read from here while idle. docs/desktop/local-crawl.md. */
export function registerLocalCrawl(ctx: MainContext): void {
  ctx.provideSettings(() => ({ localCrawl: ctx.desktop.localCrawl === true }));

  ipcMain.handle(IpcChannel.desktopSetLocalCrawl, (_event, enabled: unknown): DesktopSettings => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    ctx.saveDesktop({ localCrawl: enabled });
    return ctx.settings();
  });

  if (ctx.captureDir) return;
  const session = ctx.session;
  let browser: HiddenBrowser | null = null;
  const crawler = new LocalCrawler({
    api: (path, init) => session.api(path, init),
    conditions: () => ({
      enabled: ctx.desktop.localCrawl === true,
      signedIn: session.getState().status === 'signed-in',
      onBattery: powerMonitor.isOnBatteryPower(),
      idleState: powerMonitor.getSystemIdleState(IDLE_AFTER_S),
    }),
    browser: () => (browser ??= new HiddenBrowser()),
    log: (message) => console.info(`[local-crawl] ${message}`),
  });
  crawler.start();
  // Locking the screen is the clearest "I am away": start then rather than at the next check.
  powerMonitor.on('lock-screen', () => void crawler.tick());
  ctx.onQuit(() => crawler.stop());
}
