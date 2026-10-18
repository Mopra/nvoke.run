import type React from 'react';
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Box } from '../layout';
import { TAKE_WIDTH, type Take } from '../takes';
import { EASE_IN_OUT } from '../theme';

export interface CameraKey {
  /** Local frame the move into this key starts. */
  at: number;
  /** Frames the move takes. */
  dur?: number;
  /** Zoom around the focus. 1 is the resting frame. */
  zoom?: number;
  /** Point to bring to the anchor, in window pixels (2400x1350). Defaults to the window center. */
  focus?: { x: number; y: number };
  /** Frame a named rect of the take instead; overrides zoom and focus when the rect exists. */
  rect?: string;
  /** With rect: the share of the frame the rect should fill (0 to 1). */
  fill?: number;
  /** With rect: the most the camera may zoom, so a small control never fills the frame. */
  maxZoom?: number;
  /** Where the focus lands on screen, frame pixels. Defaults to the window's resting center. */
  anchor?: { x: number; y: number };
  /** Apple's cubic easeInOut, or a critically damped spring (no overshoot). */
  ease?: 'inOut' | 'spring';
}

interface View {
  zoom: number;
  focus: { x: number; y: number };
  anchor: { x: number; y: number };
}

const easeInOut = Easing.bezier(...EASE_IN_OUT);
/** Past about 1.5x the 2400 px take upscales; 2.4x is the softest we accept. */
const MAX_ZOOM = 2.4;

export interface CameraProps {
  /** The window's resting box in frame pixels; maps window pixels to the frame. */
  box: Box;
  keys: CameraKey[];
  /** The take whose rects the keys can target. */
  take?: Take;
  children: React.ReactNode;
}

/**
 * Moves the shot: zooms and pans its children (laid out in frame pixels)
 * between keyframes. A key can name one of the take's measured rects ("the
 * counters", "this person row") and the camera frames it. Zoom moves in log
 * space so a 1x to 3x push feels even all the way.
 */
export const Camera: React.FC<CameraProps> = ({ box, keys, take, children }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const s = box.w / TAKE_WIDTH;
  const toFrame = (p: { x: number; y: number }) => ({ x: box.x + p.x * s, y: box.y + p.y * s });
  const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const rest: View = { zoom: 1, focus: center, anchor: center };

  const resolve = (k: CameraKey): View => {
    const anchor = k.anchor ?? center;
    const rect = k.rect ? take?.rects[k.rect] : undefined;
    if (rect) {
      const fill = k.fill ?? 0.6;
      const zoom = Math.min((width * fill) / (rect.w * s), (height * fill) / (rect.h * s), k.maxZoom ?? MAX_ZOOM);
      return { zoom, focus: toFrame({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }), anchor };
    }
    return { zoom: k.zoom ?? 1, focus: k.focus ? toFrame(k.focus) : center, anchor };
  };

  const sorted = [...keys].sort((a, b) => a.at - b.at);

  // The view at frame f considering keys [0, n): each move starts from wherever the previous ones left it.
  const viewAt = (f: number, n: number): View => {
    let idx = -1;
    for (let i = 0; i < n; i++) if (sorted[i]!.at <= f) idx = i;
    if (idx < 0) return rest;
    const k = sorted[idx]!;
    const from = viewAt(k.at, idx);
    const to = resolve(k);
    const dur = k.dur ?? 60;
    const p =
      k.ease === 'spring'
        ? spring({ frame: f - k.at, fps, durationInFrames: dur, config: { damping: 200, mass: 1, stiffness: 80 } })
        : interpolate(f, [k.at, k.at + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
    const lerp = (a: number, b: number) => a + (b - a) * p;
    return {
      zoom: Math.exp(lerp(Math.log(from.zoom), Math.log(to.zoom))),
      focus: { x: lerp(from.focus.x, to.focus.x), y: lerp(from.focus.y, to.focus.y) },
      anchor: { x: lerp(from.anchor.x, to.anchor.x), y: lerp(from.anchor.y, to.anchor.y) },
    };
  };

  const v = viewAt(frame, sorted.length);
  // screen = anchor + (p - focus) * zoom, written as translate then scale from the origin.
  const tx = v.anchor.x - v.focus.x * v.zoom;
  const ty = v.anchor.y - v.focus.y * v.zoom;

  return (
    <AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${v.zoom})`, transformOrigin: '0 0' }}>
      {children}
    </AbsoluteFill>
  );
};
