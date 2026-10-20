import { createContext, useContext } from 'react';
import { getStaticFiles, staticFile } from 'remotion';
import { TAKE_NAMES, type TakeName } from './timeline';

/**
 * The take contract with the recording rig (apps/desktop). Each scene lands in
 * public/takes/ as <take>.mp4 (the app window only, cropped and trimmed,
 * 2400x1350 at 60 fps, frame 0 = t 0, square corners) and <take>.json below.
 */
export interface Take {
  take: string;
  fps: 60;
  width: 2400;
  height: 1350;
  durationMs: number;
  /** Pointer path in window pixels (2400x1350 space), ms from frame 0. The real cursor is not in the video: you draw it. */
  cursor: { t: number; x: number; y: number }[];
  /** Clicks, key presses and named marks the scene script set, for timing cuts and camera moves. */
  events: { t: number; type: 'down' | 'up' | 'key' | 'mark'; x?: number; y?: number; label?: string }[];
  /** Named rectangles (window pixels) the script measured, e.g. a counter row or one person row, for camera targets. */
  rects: Record<string, Rect>;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const TAKE_WIDTH = 2400;
export const TAKE_HEIGHT = 1350;
/** Windows 11 window radius: 8 logical px at device scale 2. */
export const TAKE_RADIUS = 16;

/** What the film knows about one take: its data, and whether the video exists. */
export interface TakeState {
  take: Take;
  hasVideo: boolean;
  /** True when take was synthesized because <take>.json is missing. */
  placeholder: boolean;
}

export type Takes = Record<TakeName, TakeState>;

const normalize = (name: string) => name.replace(/\\/g, '/').replace(/^\/+/, '');

/**
 * Reads every take from public/takes/. Runs in calculateMetadata, so the
 * render waits for it and the scenes get plain props. getStaticFiles lists the
 * public folder at bundle time (and live in the Studio), so a missing file is
 * known without a failing request.
 */
export async function loadTakes(): Promise<Takes> {
  const files = new Set(getStaticFiles().map((f) => normalize(f.name)));
  const entries = await Promise.all(
    TAKE_NAMES.map(async (name): Promise<[TakeName, TakeState]> => {
      const hasVideo = files.has(`takes/${name}.mp4`);
      if (!files.has(`takes/${name}.json`)) {
        return [name, { take: placeholderTake(name), hasVideo, placeholder: true }];
      }
      const res = await fetch(staticFile(`takes/${name}.json`));
      if (!res.ok) throw new Error(`takes/${name}.json: HTTP ${res.status}`);
      const take = (await res.json()) as Partial<Take>;
      // A real take keeps only its own rects: a placeholder spot would aim the camera wrong.
      const full: Take = {
        ...placeholderTake(name),
        cursor: [],
        events: [],
        rects: {},
        ...take,
      };
      return [name, { take: full, hasVideo, placeholder: false }];
    }),
  );
  return Object.fromEntries(entries) as Takes;
}

/** Every take as a placeholder: the default props, before calculateMetadata runs. */
export const placeholderTakes = (): Takes =>
  Object.fromEntries(
    TAKE_NAMES.map((name) => [name, { take: placeholderTake(name), hasVideo: false, placeholder: true }]),
  ) as Takes;

const r = (x: number, y: number, w: number, h: number): Rect => ({ x: x * 2, y: y * 2, w: w * 2, h: h * 2 });

/**
 * The rect names the scenes target, with a plausible spot in the 1200x675
 * logical window, so camera moves preview before the recordings exist. The
 * rig should measure and emit the same names.
 */
export const PLACEHOLDER_RECTS: Record<TakeName, Record<string, Rect>> = {
  journey: { siteField: r(330, 300, 540, 52), suggestion: r(250, 390, 700, 52), counters: r(72, 96, 560, 92) },
  'journey-dark': { siteField: r(330, 300, 540, 52), suggestion: r(250, 390, 700, 52), counters: r(72, 96, 560, 92) },
  command: { commandBar: r(300, 0, 600, 140) },
  quick: { quickWindow: r(260, 108, 680, 180) },
  grab: { grabBox: r(230, 320, 740, 420) },
  people: { personRow: r(330, 120, 560, 40) },
  drop: { dropZone: r(300, 200, 600, 280) },
  agents: { mcpPanel: r(280, 100, 620, 120) },
  ongoing: { ongoing: r(28, 150, 30, 18) },
};

/** Which placeholder rect the synthesized cursor travels to and clicks. */
const CLICK_TARGET: Record<TakeName, string> = {
  journey: 'siteField',
  'journey-dark': 'siteField',
  command: 'commandBar',
  quick: 'quickWindow',
  grab: 'grabBox',
  people: 'personRow',
  drop: 'dropZone',
  agents: 'mcpPanel',
  ongoing: 'ongoing',
};

/** A stand-in take: 12 s, the cursor glides to its target, clicks, then rests. */
export function placeholderTake(name: TakeName): Take {
  const rects = PLACEHOLDER_RECTS[name];
  const target = rects[CLICK_TARGET[name]] ?? r(600, 337, 1, 1);
  const tx = target.x + target.w * 0.3;
  const ty = target.y + target.h * 0.5;
  const sx = 1900;
  const sy = 1180;
  const cursor: Take['cursor'] = [];
  // A gentle arc, eased, from the bottom right to the target.
  for (let t = 0; t <= 1600; t += 50) {
    const p = Math.min(1, Math.max(0, (t - 400) / 1200));
    const e = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
    const arc = Math.sin(e * Math.PI) * 90;
    cursor.push({ t, x: sx + (tx - sx) * e - arc * 0.4, y: sy + (ty - sy) * e - arc });
  }
  cursor.push({ t: 12000, x: tx, y: ty });
  return {
    take: name,
    fps: 60,
    width: TAKE_WIDTH,
    height: TAKE_HEIGHT,
    durationMs: 12000,
    cursor,
    events: [
      { t: 1750, type: 'down', x: tx, y: ty },
      { t: 1860, type: 'up', x: tx, y: ty },
      { t: 1860, type: 'mark', label: 'clicked' },
    ],
    rects,
  };
}

export const TakesContext = createContext<Takes>(placeholderTakes());

export function useTake(name: TakeName): TakeState {
  return useContext(TakesContext)[name];
}

/** The first event with this label (mark) or type, for timing a cut or a camera move. */
export function findEvent(take: Take, match: string): Take['events'][number] | undefined {
  return take.events.find((e) => e.label === match) ?? take.events.find((e) => e.type === match);
}

/** When the rig logged a mark, in ms. 0 when the take has no such mark (a placeholder). */
export function markTime(take: Take, label: string): number {
  return take.events.find((e) => e.type === 'mark' && e.label === label)?.t ?? 0;
}
