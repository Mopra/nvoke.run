import { spawn, type ChildProcess } from 'node:child_process';
import { BrowserWindow, screen } from 'electron';
import { sleep } from '../kit';

/**
 * Records the whole screen with ffmpeg's Desktop Duplication grabber
 * (`ddagrab`, Windows 8 and later) on the GPU encoder, at 60 fps with the
 * cursor left out. A tiny flash window in the screen's top left corner turns
 * from black to white when the scene's clock starts, so `scripts/film.mjs`
 * can find frame 0 exactly before it crops the take to the main window.
 */

/** The flash, in DIPs from the display's top left corner. */
export const FLASH = { x: 0, y: 0, size: 8 };

export class Recorder {
  private ffmpeg: ChildProcess | null = null;
  private flash: BrowserWindow | null = null;
  private exited: Promise<number | null> = Promise.resolve(null);

  constructor(
    private readonly file: string,
    private readonly encoder = process.env['NVOKE_FILM_ENCODER'] || 'h264_nvenc',
  ) {}

  async begin(): Promise<void> {
    const display = screen.getPrimaryDisplay();
    this.flash = new BrowserWindow({
      x: display.bounds.x + FLASH.x,
      y: display.bounds.y + FLASH.y,
      width: FLASH.size,
      height: FLASH.size,
      frame: false,
      resizable: false,
      focusable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#000000',
      show: false,
    });
    this.flash.setAlwaysOnTop(true, 'screen-saver');
    await this.flash.loadURL('data:text/html,<body style="margin:0;background:%23000"></body>');
    this.flash.showInactive();

    const quality = this.encoder.endsWith('nvenc') ? ['-preset', 'p7', '-tune', 'hq', '-rc', 'constqp', '-qp', '12'] : ['-crf', '10', '-preset', 'veryfast'];
    this.ffmpeg = spawn(
      'ffmpeg',
      ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'ddagrab=output_idx=0:framerate=60:draw_mouse=0', '-c:v', this.encoder, ...quality, this.file],
      { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true },
    );
    const proc = this.ffmpeg;
    this.exited = new Promise((r) => proc.once('exit', (code) => r(code)));
    // The grabber needs a moment before its first frame.
    await sleep(1500);
  }

  /** Frame 0 of the take. */
  async sync(): Promise<void> {
    await this.flash?.webContents.executeJavaScript(`document.body.style.background = '#fff'`);
  }

  async end(): Promise<void> {
    await sleep(500);
    this.ffmpeg?.stdin?.write('q');
    const code = await this.exited;
    if (code !== 0) console.warn(`[film] ffmpeg exited with ${code}`);
    this.flash?.destroy();
    this.flash = null;
  }
}
