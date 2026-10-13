import { join } from 'node:path';
import { app, BrowserWindow, desktopCapturer, ipcMain, screen, shell, systemPreferences, type Display, type NativeImage, type WebContents } from 'electron';
import { IpcChannel, type GrabFrame, type GrabRect, type GrabState } from '../ipc/contract';
import { extractCompanies } from './grab-extract';
import { cropRect, isGrabRect } from './quick-geometry';
import { OcrUnavailable, recognize } from './ocr';

/**
 * Grab from screen: the quick window hides, the display under the pointer is
 * captured once and frozen under a full screen overlay, the user drags a box
 * over a list of companies, and that box is read with the OS text engine
 * (ocr.ts). The quick window comes back with the companies as a list to edit
 * before a domains search starts.
 *
 * The image never leaves this computer: it lives in main, the overlay gets it
 * to paint, the crop is a temp file for the OCR engine, and only company
 * names and domains reach the quick window. People's names and personal
 * addresses are dropped in `extractCompanies`.
 */

/** The parts of the quick window a grab drives. */
export interface GrabHost {
  hide(): void;
  /** Shows the quick window as it is, without starting it over. */
  reveal(): void;
  send(state: GrabState): void;
  isSender(sender: WebContents): boolean;
}

const SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
/** OCR engines read small screen text better at twice the size. */
const UPSCALE_BELOW = 1400;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ScreenGrab {
  private overlay: BrowserWindow | null = null;
  private frame: NativeImage | null = null;
  private display: Display | null = null;
  private busy = false;

  constructor(private readonly host: GrabHost) {}

  registerIpc(): void {
    const fromOverlay = (sender: WebContents): boolean => !!this.overlay && !this.overlay.isDestroyed() && sender === this.overlay.webContents;

    ipcMain.on(IpcChannel.grabStart, (event) => {
      if (this.host.isSender(event.sender)) void this.start();
    });
    ipcMain.on(IpcChannel.grabOpenSettings, (event) => {
      if (this.host.isSender(event.sender) && process.platform === 'darwin') void shell.openExternal(SETTINGS_URL);
    });
    ipcMain.handle(IpcChannel.grabGetFrame, (event): GrabFrame | null => {
      if (!fromOverlay(event.sender) || !this.frame || !this.display) return null;
      return { image: this.frame.toDataURL(), width: this.display.bounds.width, height: this.display.bounds.height };
    });
    ipcMain.on(IpcChannel.grabSelect, (event, rect: unknown) => {
      if (fromOverlay(event.sender) && isGrabRect(rect)) void this.select(rect);
    });
    ipcMain.on(IpcChannel.grabCancel, (event) => {
      if (fromOverlay(event.sender)) this.cancel();
    });
  }

  /** The overlay while it is up, for the capture script. */
  get overlayWindow(): BrowserWindow | null {
    return this.overlay && !this.overlay.isDestroyed() ? this.overlay : null;
  }

  async start(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.host.hide();
      // Let the quick window fade out before the screen is captured.
      await sleep(180);

      if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
        // Asking once registers nvoke under Screen Recording and shows the system prompt.
        await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => []);
        this.finish({
          status: 'error',
          reason: 'permission',
          message: 'Allow nvoke under Screen Recording in System Settings, then quit and reopen nvoke.',
        });
        return;
      }

      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      const frame = await this.captureDisplay(display);
      if (!frame) {
        this.finish({ status: 'error', reason: 'failed', message: 'nvoke could not capture the screen.' });
        return;
      }
      this.frame = frame;
      this.display = display;
      this.openOverlay(display);
    } catch (error) {
      this.finish({ status: 'error', reason: 'failed', message: `nvoke could not capture the screen. ${String(error)}` });
    }
  }

  private async captureDisplay(display: Display): Promise<NativeImage | null> {
    const scale = display.scaleFactor;
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) },
    });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : undefined);
    if (!source || source.thumbnail.isEmpty()) return null;
    return source.thumbnail;
  }

  private openOverlay(display: Display): void {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      enableLargerThanScreen: true,
      skipTaskbar: true,
      hasShadow: false,
      roundedCorners: false,
      // Clear until the frozen frame paints, which looks the same as the live screen.
      transparent: true,
      backgroundColor: '#00000000',
      title: 'nvoke grab',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // Windows places a new window on the primary display's scale first; set the bounds again.
    win.setBounds(display.bounds);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
      if (url !== win.webContents.getURL()) event.preventDefault();
    });
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
    });
    win.on('blur', () => {
      if (this.overlay === win) this.cancel();
    });
    win.on('closed', () => {
      if (this.overlay === win) this.overlay = null;
    });
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (!app.isPackaged && devUrl) void win.loadURL(`${devUrl}#/grab`);
    else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/grab' });
    this.overlay = win;
  }

  private closeOverlay(): void {
    const win = this.overlay;
    this.overlay = null;
    if (win && !win.isDestroyed()) win.destroy();
  }

  cancel(): void {
    this.closeOverlay();
    this.frame = null;
    this.display = null;
    this.busy = false;
    if (process.platform === 'darwin' && !BrowserWindow.getAllWindows().some((w) => w.isVisible())) app.hide();
  }

  /** Reads the box. Public so the capture script can drive a grab without a mouse. */
  async select(rect: GrabRect): Promise<void> {
    const frame = this.frame;
    const display = this.display;
    this.closeOverlay();
    this.frame = null;
    this.display = null;
    if (!frame || !display) {
      this.busy = false;
      return;
    }
    const size = frame.getSize();
    const crop = cropRect(rect, display.bounds, size.width / display.bounds.width);
    if (!crop) {
      this.busy = false;
      return;
    }
    this.host.reveal();
    this.host.send({ status: 'reading' });
    try {
      let image = frame.crop(crop);
      if (crop.width < UPSCALE_BELOW) image = image.resize({ width: crop.width * 2, quality: 'best' });
      const segments = await recognize(image.toPNG());
      const { items, people } = extractCompanies(segments);
      if (items.length === 0) {
        this.finish({
          status: 'error',
          reason: 'empty',
          message: people > 0 ? 'Only people in that box. nvoke keeps companies, not names.' : 'No companies in that box. Try a tighter box around the list.',
        });
      } else {
        this.finish({ status: 'done', items, people });
      }
    } catch (error) {
      if (error instanceof OcrUnavailable) this.finish({ status: 'error', reason: 'ocr', message: error.message });
      else this.finish({ status: 'error', reason: 'failed', message: 'Reading the text failed. Try again.' });
    }
  }

  private finish(state: GrabState): void {
    this.busy = false;
    this.host.reveal();
    this.host.send(state);
  }

  destroy(): void {
    this.closeOverlay();
    this.frame = null;
  }
}
