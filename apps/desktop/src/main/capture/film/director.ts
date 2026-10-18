import type { BrowserWindow } from 'electron';
import { sleep } from '../kit';

/**
 * Plays a film scene in the real window with real input events, so hover,
 * press and focus states show, and logs what it did for apps/video: the pointer
 * path, clicks, keys, named marks and measured rectangles. Coordinates are
 * window DIPs when driving and window pixels (DIPs times the device scale) in
 * the log, since the take is cropped to the window. The OS cursor never
 * moves: the film draws its own from the log.
 */

export interface TakeLog {
  cursor: { t: number; x: number; y: number }[];
  events: { t: number; type: 'down' | 'up' | 'key' | 'mark'; x?: number; y?: number; label?: string }[];
  rects: Record<string, { x: number; y: number; w: number; h: number }>;
}

type Target = string | { x: number; y: number };

/** Ease in and out, like a hand that speeds up and settles. */
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class Director {
  readonly log: TakeLog = { cursor: [], events: [], rects: {} };
  private t0 = 0;
  private pos = { x: 0, y: 0 };
  /** Deterministic jitter, so a re-shoot types and moves the same way. */
  private seed = 7;
  private tags = 0;

  constructor(
    readonly win: BrowserWindow,
    private readonly scale: number,
  ) {}

  /** Starts the clock: everything after is logged from here. */
  start(): void {
    this.t0 = Date.now();
    this.trace();
  }

  get elapsed(): number {
    return Date.now() - this.t0;
  }

  private rand(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  private trace(): void {
    // Setup moves happen before the clock starts and are not part of the take.
    if (!this.t0) return;
    this.log.cursor.push({ t: this.elapsed, x: Math.round(this.pos.x * this.scale), y: Math.round(this.pos.y * this.scale) });
  }

  js<T = unknown>(code: string): Promise<T> {
    return this.win.webContents.executeJavaScript(code, true) as Promise<T>;
  }

  /** The DIP rectangle of the first element matching `selector`, waiting up to `timeout` for it. */
  async box(selector: string, timeout = 8000): Promise<{ x: number; y: number; w: number; h: number }> {
    const end = Date.now() + timeout;
    for (;;) {
      const r = await this.js<{ x: number; y: number; w: number; h: number } | null>(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return b.width || b.height ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
      })()`);
      if (r) return r;
      if (Date.now() > end) throw new Error(`[film] ${selector} never showed`);
      await sleep(80);
    }
  }

  /**
   * A selector for the first `within` element whose trimmed text or aria-label
   * is `text`, once it shows. Tags it, since CSS cannot match on text.
   */
  async byText(text: string, within = 'button, [role="menuitem"], a'): Promise<string> {
    const id = `t${++this.tags}`;
    const end = Date.now() + 15_000;
    while (
      !(await this.js<boolean>(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(within)})].find(
          (e) => e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)},
        );
        if (el) el.setAttribute('data-film', ${JSON.stringify(id)});
        return !!el;
      })()`))
    ) {
      if (Date.now() > end) throw new Error(`[film] no ${within} reads "${text}"`);
      await sleep(80);
    }
    return `[data-film="${id}"]`;
  }

  /** Waits until `selector` is on the page. */
  async until(selector: string, timeout = 15_000): Promise<void> {
    await this.box(selector, timeout);
  }

  /** Records a named rectangle for the camera, in window pixels. */
  async rect(name: string, selector: string): Promise<void> {
    const b = await this.box(selector);
    const s = this.scale;
    this.log.rects[name] = { x: Math.round(b.x * s), y: Math.round(b.y * s), w: Math.round(b.w * s), h: Math.round(b.h * s) };
  }

  mark(label: string): void {
    this.log.events.push({ t: this.elapsed, type: 'mark', label });
  }

  async hold(ms: number): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await sleep(Math.min(100, end - Date.now()));
      this.trace();
    }
  }

  /** Puts the pointer somewhere without moving through the space between. */
  place(x: number, y: number): void {
    this.pos = { x, y };
    this.win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
    this.trace();
  }

  private async point(target: Target): Promise<{ x: number; y: number }> {
    if (typeof target !== 'string') return target;
    const b = await this.box(target);
    // A hand lands a little off center, never on the exact middle.
    return { x: b.x + b.w * (0.42 + this.rand() * 0.16), y: b.y + b.h * (0.45 + this.rand() * 0.1) };
  }

  /** Glides the pointer to `target` on a slight arc. Duration grows with distance unless given. */
  async move(target: Target, ms?: number): Promise<void> {
    const to = await this.point(target);
    const from = { ...this.pos };
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (dist < 1) return;
    const duration = ms ?? Math.min(1100, 380 + dist * 0.55);
    // The arc bends a tenth of the way, to one side, like a wrist turning.
    const bend = (this.rand() < 0.5 ? -1 : 1) * dist * 0.1;
    const nx = -(to.y - from.y) / dist;
    const ny = (to.x - from.x) / dist;
    const ctrl = { x: (from.x + to.x) / 2 + nx * bend, y: (from.y + to.y) / 2 + ny * bend };
    const start = Date.now();
    for (;;) {
      const p = Math.min(1, (Date.now() - start) / duration);
      const e = ease(p);
      const x = (1 - e) ** 2 * from.x + 2 * (1 - e) * e * ctrl.x + e * e * to.x;
      const y = (1 - e) ** 2 * from.y + 2 * (1 - e) * e * ctrl.y + e * e * to.y;
      this.pos = { x, y };
      this.win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) });
      this.trace();
      if (p >= 1) break;
      await sleep(8);
    }
  }

  /** Moves to `target`, rests a beat, and clicks. */
  async click(target: Target, opts: { rest?: number; ms?: number } = {}): Promise<void> {
    await this.move(target, opts.ms);
    await this.hold(opts.rest ?? 140);
    const x = Math.round(this.pos.x);
    const y = Math.round(this.pos.y);
    const wc = this.win.webContents;
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    this.log.events.push({ t: this.elapsed, type: 'down', x: Math.round(x * this.scale), y: Math.round(y * this.scale) });
    await this.hold(90);
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    this.log.events.push({ t: this.elapsed, type: 'up', x: Math.round(x * this.scale), y: Math.round(y * this.scale) });
  }

  /** Types into the focused field at a human pace: quicker inside words, a breath at spaces. */
  async type(text: string, cps = 13): Promise<void> {
    const wc = this.win.webContents;
    for (const ch of text) {
      wc.sendInputEvent({ type: 'char', keyCode: ch });
      this.log.events.push({ t: this.elapsed, type: 'key', label: ch });
      const base = 1000 / cps;
      await this.hold(base * (ch === ' ' ? 1.6 : 0.6 + this.rand() * 0.7));
    }
  }

  /** Presses a key, with modifiers like `['control']`. */
  async key(keyCode: string, modifiers: ('control' | 'shift' | 'alt' | 'meta')[] = []): Promise<void> {
    const wc = this.win.webContents;
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    if (keyCode.length === 1 && modifiers.length === 0) wc.sendInputEvent({ type: 'char', keyCode, modifiers });
    this.log.events.push({ t: this.elapsed, type: 'key', label: [...modifiers, keyCode].join('+') });
    await this.hold(60);
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
  }

  /** Scrolls the page under the pointer by `dy` DIPs over `ms`, in small wheel steps. */
  async scroll(dy: number, ms = 900): Promise<void> {
    const steps = Math.max(1, Math.round(ms / 16));
    let done = 0;
    for (let i = 1; i <= steps; i++) {
      const want = Math.round(dy * ease(i / steps));
      const delta = want - done;
      done = want;
      if (delta !== 0) {
        this.win.webContents.sendInputEvent({
          type: 'mouseWheel',
          x: Math.round(this.pos.x),
          y: Math.round(this.pos.y),
          deltaX: 0,
          deltaY: -delta,
        });
      }
      this.trace();
      await sleep(16);
    }
  }
}
