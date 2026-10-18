import type React from 'react';
import type { Take } from '../takes';
import { theme } from '../theme';

type Sample = Take['cursor'][number];

/** Linear position on the path at time t (ms), clamped to its ends. */
function at(path: Sample[], t: number): { x: number; y: number } {
  const first = path[0]!;
  const last = path[path.length - 1]!;
  if (t <= first.t) return first;
  if (t >= last.t) return last;
  let lo = 0;
  let hi = path.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (path[mid]!.t <= t) lo = mid;
    else hi = mid;
  }
  const a = path[lo]!;
  const b = path[hi]!;
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/**
 * Gaussian smoothing over +-SMOOTH ms. Recorded pointer paths jitter at
 * 1 px and stair step at the sampling rate; this keeps the motion human and
 * the arrow steady, while a click still lands where it was recorded.
 */
const SMOOTH = 70;
function smoothed(path: Sample[], t: number) {
  let x = 0;
  let y = 0;
  let w = 0;
  for (let o = -SMOOTH; o <= SMOOTH; o += SMOOTH / 4) {
    const k = Math.exp(-((o / SMOOTH) ** 2) * 2.2);
    const p = at(path, t + o);
    x += p.x * k;
    y += p.y * k;
    w += k;
  }
  return { x: x / w, y: y / w };
}

const MOVE_EPS = 1.5;

/** The last time at or before t the pointer moved, and the next time after t it moves. */
function activity(path: Sample[], t: number) {
  let last = -Infinity;
  let next = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const moved = Math.hypot(b.x - a.x, b.y - a.y) > MOVE_EPS;
    if (!moved) continue;
    if (a.t <= t) last = Math.min(b.t, t);
    if (b.t > t && next === Infinity) next = Math.max(a.t, t);
  }
  return { last, next };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 0 to 1: how far the button is pressed at t, eased in on down and out on up. */
function pressAt(events: Take['events'], t: number) {
  let down = -Infinity;
  let up = -Infinity;
  for (const e of events) {
    if (e.t > t) break;
    if (e.type === 'down') down = e.t;
    if (e.type === 'up') up = e.t;
  }
  if (down === -Infinity) return { press: 0, down };
  if (up < down) return { press: clamp01((t - down) / 70), down };
  return { press: clamp01((t - down) / 70) * (1 - clamp01((t - up) / 140)), down };
}

export interface CursorProps {
  take: Take;
  /** Time in the take, ms. */
  t: number;
  /** Arrow height in window pixels. */
  size?: number;
  /** Idle time before the arrow fades out, ms. */
  idle?: number;
}

/**
 * A Windows 11 style arrow drawn as a vector: white body, dark hairline
 * outline, a soft two step shadow. It follows the take's pointer path with
 * smoothing, dips on press with a faint iris ring, and fades out when idle.
 * Coordinates are window pixels: place it in the window's 2400x1350 layer.
 */
export const Cursor: React.FC<CursorProps> = ({ take, t, size = 46, idle = 1800 }) => {
  const path = take.cursor;
  if (path.length === 0) return null;
  // Events arrive in order from the rig, but sort defensively.
  const events = [...take.events].sort((a, b) => a.t - b.t);

  const { last, next } = activity(path, t);
  const fadeOut = last === -Infinity ? 0 : clamp01(1 - (t - last - idle) / 260);
  const fadeIn = next === Infinity ? 0 : clamp01(1 - (next - t - 120) / 260);
  const opacity = Math.max(fadeOut, fadeIn);
  if (opacity <= 0.001) return null;

  const pos = smoothed(path, t);
  const { press, down } = pressAt(events, t);
  const scale = 1 - press * 0.14;
  const ring = t - down;
  const ringP = clamp01(ring / 480);
  const k = size / 26;

  return (
    <>
      {ring >= 0 && ring < 480 && (
        <div
          style={{
            position: 'absolute',
            left: pos.x,
            top: pos.y,
            width: 0,
            height: 0,
            opacity: opacity * (1 - ringP) * 0.55,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: -40 * k * (0.35 + ringP * 0.65),
              top: -40 * k * (0.35 + ringP * 0.65),
              width: 80 * k * (0.35 + ringP * 0.65),
              height: 80 * k * (0.35 + ringP * 0.65),
              borderRadius: '50%',
              boxShadow: `0 0 0 ${2.2 * k}px ${theme.primary}, 0 0 ${18 * k}px ${theme.glow}`,
            }}
          />
        </div>
      )}
      <svg
        width={20 * k}
        height={size}
        viewBox="0 0 20 26"
        style={{
          position: 'absolute',
          left: pos.x - 2.2 * k,
          top: pos.y - 1.6 * k,
          opacity,
          overflow: 'visible',
          transform: `scale(${scale})`,
          transformOrigin: `${2.2 * k}px ${1.6 * k}px`,
          filter: `drop-shadow(0 ${1.2 * k}px ${1.4 * k}px oklch(0.2 0.01 265 / 0.28)) drop-shadow(0 ${4 * k}px ${6 * k}px oklch(0.2 0.01 265 / 0.16))`,
        }}
      >
        <path
          d="M2.2 1.6 L2.2 20.4 Q2.2 21.4 3 20.8 L7.3 16.9 L10.2 23.6 Q10.5 24.3 11.2 24 L13 23.2 Q13.7 22.9 13.4 22.2 L10.6 15.6 L16.6 15.6 Q17.6 15.6 16.9 14.9 L3.1 1.2 Q2.2 0.4 2.2 1.6 Z"
          fill="white"
          stroke={theme.foreground}
          strokeWidth={1.15}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
