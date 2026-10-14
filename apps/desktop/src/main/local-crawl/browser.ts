import { app, BrowserWindow, session, type Session, type WebContents } from 'electron';
import { BOT_USER_AGENT, CRAWL_MAX_BYTES } from '@nvoke/shared/crawl';
import { HostLimiter } from './limiter';
import { isLocalHost, resolvesPublic } from './net-guard';
import type { PageLoad, PageLoader } from './reader';
import { RobotsCache } from './robots';

/**
 * The hidden window the local render crawl reads pages in. Never shown,
 * sandboxed, no preload, no Node, images off, in an in-memory session that is
 * wiped after every company. Every request passes through onBeforeRequest:
 * local and private hosts are refused, images, media, fonts and frames are
 * not loaded, and each page load (redirects included) must be allowed by
 * robots.txt, resolve to a public address and wait its turn at one page a
 * second per host. See docs/desktop/local-crawl.md.
 */

export const CRAWL_PARTITION = 'nvoke-local-crawl';
const LOAD_TIMEOUT_MS = 20_000;
const RENDER_WAIT_MS = 1_500;
/** An isolated world: shares the DOM with the page, never its scripts. */
const ISOLATED_WORLD = 1_001;

const SKIPPED_TYPES = new Set(['image', 'media', 'font', 'object', 'ping', 'cspReport', 'subFrame', 'webSocket']);

/** Main world overrides so a page cannot open a native dialog from a window nobody sees. */
const SILENCE_DIALOGS =
  'window.alert=function(){};window.confirm=function(){return false};window.prompt=function(){return null};window.print=function(){};';

const READ_DOM = `(() => { const el = document.documentElement; return el ? el.outerHTML.slice(0, ${CRAWL_MAX_BYTES}) : ''; })()`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class HiddenBrowser implements PageLoader {
  private readonly ses: Session;
  private readonly robots: RobotsCache;
  private readonly limiter = new HostLimiter(1_000);
  private win: BrowserWindow | null = null;
  /** Set when onBeforeRequest refused the main frame for robots.txt during the current load. */
  private robotsRefused = false;
  /** HTTP status of the last main frame response. */
  private mainStatus = 0;

  constructor() {
    this.ses = session.fromPartition(CRAWL_PARTITION, { cache: false });
    this.robots = new RobotsCache(
      undefined,
      undefined,
      (host) => this.limiter.wait(host),
      (host) => resolvesPublic(host),
    );
    this.ses.setUserAgent(BOT_USER_AGENT);
    this.ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    this.ses.setPermissionCheckHandler(() => false);
    this.ses.on('will-download', (event) => event.preventDefault());
    this.ses.webRequest.onBeforeRequest((details, callback) => {
      void this.vet(details.url, details.resourceType).then((cancel) => callback({ cancel }));
    });
    this.ses.webRequest.onHeadersReceived({ urls: ['*://*/*'] }, (details, callback) => {
      if (details.resourceType === 'mainFrame') this.mainStatus = details.statusCode;
      callback({});
    });
    app.on('select-client-certificate', (event, webContents, _url, _list, callback) => {
      if (webContents === this.win?.webContents) {
        event.preventDefault();
        callback();
      }
    });
  }

  /** True to cancel the request. */
  private async vet(raw: string, resourceType: string): Promise<boolean> {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return true;
    }
    if (url.protocol === 'data:' || url.protocol === 'blob:') return SKIPPED_TYPES.has(resourceType);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return true;
    if (isLocalHost(url.hostname)) return true;
    if (SKIPPED_TYPES.has(resourceType)) return true;
    if (resourceType !== 'mainFrame') return false;
    const rules = await this.robots.rulesFor(url.toString());
    if (!rules.isAllowed(url.toString())) {
      this.robotsRefused = true;
      return true;
    }
    if (!(await resolvesPublic(url.hostname))) return true;
    await this.limiter.wait(url.hostname, rules.crawlDelayMs);
    return false;
  }

  private window(): BrowserWindow {
    if (this.win && !this.win.isDestroyed()) return this.win;
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        session: this.ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        images: false,
        webgl: false,
        spellcheck: false,
        backgroundThrottling: false,
        autoplayPolicy: 'user-gesture-required',
      },
    });
    const wc = win.webContents;
    wc.setAudioMuted(true);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('will-prevent-unload', (event) => event.preventDefault());
    wc.on('login', (event, _details, _auth, callback) => {
      event.preventDefault();
      callback();
    });
    silenceDialogs(wc);
    this.win = win;
    return win;
  }

  async load(url: string): Promise<PageLoad> {
    const wc = this.window().webContents;
    this.robotsRefused = false;
    this.mainStatus = 0;
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), LOAD_TIMEOUT_MS);
    });
    let error: string | null = null;
    const loaded = wc.loadURL(url).then(
      () => 'loaded' as const,
      (err: unknown) => {
        error = err instanceof Error ? err.message : String(err);
        return 'failed' as const;
      },
    );
    const outcome = await Promise.race([loaded, timedOut]);
    clearTimeout(timer);
    if (this.robotsRefused) return { kind: 'robots' };
    if (outcome === 'timeout') wc.stop();
    else if (outcome === 'failed') return { kind: 'error', error: error ?? 'load failed' };
    if (this.mainStatus >= 400) return { kind: 'error', error: `answered ${this.mainStatus}` };
    await sleep(RENDER_WAIT_MS);
    try {
      const html: unknown = await wc.executeJavaScriptInIsolatedWorld(ISOLATED_WORLD, [{ code: READ_DOM }]);
      if (typeof html !== 'string' || html.length === 0) return { kind: 'error', error: 'empty page' };
      return { kind: 'ok', url: wc.getURL() || url, html };
    } catch (err) {
      return { kind: 'error', error: err instanceof Error ? err.message : String(err) };
    }
  }

  /** Closes the window and wipes everything the session kept: cookies, storage, cache. */
  async reset(): Promise<void> {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.win = null;
    await this.ses.clearStorageData().catch(() => undefined);
    await this.ses.clearCache().catch(() => undefined);
    this.ses.clearAuthCache?.();
  }
}

/**
 * Overrides alert, confirm, prompt and print in every new document through
 * the DevTools protocol, before the page's own scripts run, and dismisses any
 * dialog that still opens.
 */
function silenceDialogs(wc: WebContents): void {
  try {
    wc.debugger.attach('1.3');
  } catch {
    return;
  }
  void wc.debugger.sendCommand('Page.enable').catch(() => undefined);
  void wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: SILENCE_DIALOGS }).catch(() => undefined);
  wc.debugger.on('message', (_event, method) => {
    if (method === 'Page.javascriptDialogOpening') {
      void wc.debugger.sendCommand('Page.handleJavaScriptDialog', { accept: false }).catch(() => undefined);
    }
  });
}
