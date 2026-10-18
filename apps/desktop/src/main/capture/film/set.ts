import { BrowserWindow } from 'electron';
import type { QuickWindow } from '../../quick-window';
import { sleep } from '../kit';
import { placeAt, physical } from './place';
import { toDataUrl } from './stage';

export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Everything a scene films besides the main window: the frame every take is
 * cropped to (physical pixels), a stage window that shows a made up web page
 * where the main window sits, and the quick window, placed over the frame.
 */
export class FilmSet {
  private stageWin: BrowserWindow | null = null;

  constructor(
    readonly main: BrowserWindow,
    readonly frame: PixelRect,
    readonly quick: QuickWindow | null,
    private readonly scale = 2,
  ) {
    // The quick window centers on the display under the pointer, which Electron
    // misreads at a forced scale. On the set it sits over the frame instead.
    if (quick) quick.placer = (win, height) => placeAt(win, this.quickRect(win.getBounds().width, height), this.scale);
    if (quick) quick.readsFrontTab = false;
  }

  /** Where the quick window goes: centered over the frame, a fifth of the way down. */
  quickRect(widthDip: number, heightDip: number): PixelRect {
    const w = widthDip * this.scale;
    // An even DIP left edge, a pixel off center, keeps clear of the display tie in place.ts.
    const x = this.frame.x + 2 * Math.floor((this.frame.w - w) / 4);
    return { x, y: this.frame.y + Math.round(this.frame.h * 0.16), w, h: heightDip * this.scale };
  }

  /** Shows a page where the main window sits, and hides the main window. */
  async stage(html: string): Promise<BrowserWindow> {
    let win = this.stageWin;
    if (!win || win.isDestroyed()) {
      win = new BrowserWindow({
        frame: false,
        show: false,
        resizable: false,
        skipTaskbar: true,
        backgroundColor: '#ffffff',
        webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      this.stageWin = win;
    }
    await win.loadURL(toDataUrl(html));
    placeAt(win, this.frame, this.scale);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.showInactive();
    await sleep(300);
    this.main.hide();
    return win;
  }

  /** The stage page's element `selector`, in physical pixels of the screen. */
  async stageBox(selector: string): Promise<PixelRect> {
    const win = this.stageWin;
    if (!win) throw new Error('[film] no stage');
    const r = await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`,
    );
    const at = physical(win);
    const s = this.scale;
    return { x: at.x + Math.round(r.x * s), y: at.y + Math.round(r.y * s), w: Math.round(r.w * s), h: Math.round(r.h * s) };
  }

  /** Shows the quick window above the stage. */
  raiseQuick(): void {
    this.quick?.window?.setAlwaysOnTop(true, 'screen-saver');
    this.quick?.window?.moveTop();
  }

  /** Back to the main window alone, for the next scene. */
  async reset(): Promise<void> {
    this.quick?.hide(false);
    if (this.stageWin && !this.stageWin.isDestroyed()) this.stageWin.destroy();
    this.stageWin = null;
    if (!this.main.isVisible()) {
      this.main.showInactive();
      placeAt(this.main, this.frame, this.scale);
      this.main.setAlwaysOnTop(true, 'screen-saver');
      this.main.focus();
      await sleep(400);
    }
  }
}
