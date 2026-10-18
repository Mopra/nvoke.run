import type React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BAR, BEAT } from './timing';
import { ink } from './look';

/*
 * Four bars of dots. Bar 0: one dot, the lead, blinking on the beat. Bar 1:
 * it becomes three hundred, rippling out from the middle. Bar 2: a scan line
 * crosses and most of them die. Bar 3: the ones that answer light up in iris,
 * one per sixteenth, the lead first.
 */

export const COLS = 25;
export const ROWS = 12;
const CENTER = { c: 12, r: 6 };

/** Deterministic noise per cell. */
const hash = (i: number) => {
  let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
};

interface Cell {
  i: number;
  c: number;
  r: number;
  /** Distance from the lead, in cells. */
  d: number;
  survives: boolean;
}

const CELLS: Cell[] = Array.from({ length: COLS * ROWS }, (_, i) => {
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const lead = c === CENTER.c && r === CENTER.r;
  return { i, c, r, d: Math.hypot(c - CENTER.c, r - CENTER.r), survives: lead || hash(i) < 0.13 };
});

/** The survivors in the order they light: the lead, then shuffled. */
export const SURVIVORS = CELLS.filter((x) => x.survives).sort((a, b) => {
  if (a.d === 0) return -1;
  if (b.d === 0) return 1;
  return hash(a.i * 7 + 1) - hash(b.i * 7 + 1);
});
const LIGHT_ORDER = new Map(SURVIVORS.map((x, k) => [x.i, k]));
/** How many survivors light per sixteenth, so all of them land inside bar 3. */
const PER_SIXTEENTH = Math.ceil(SURVIVORS.length / 16);
/** The frame (local to bar 3) survivor k lights. */
export const lightFrame = (k: number) => Math.floor(k / PER_SIXTEENTH) * (BEAT / 4);

const MAX_D = Math.max(...CELLS.map((x) => x.d));
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export const DotField: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const pitch = Math.min((width * 0.82) / COLS, (height * 0.7) / ROWS);
  const size = pitch * 0.2;
  // The lead sits dead center; the grid hangs around it.
  const ox = width / 2 - CENTER.c * pitch;
  const oy = height / 2 - CENTER.r * pitch;

  const bar1 = BAR;
  const bar2 = BAR * 2;
  const bar3 = BAR * 3;
  // The scan line crosses bar 2 left to right, with a little lead in and out.
  const scanX = interpolate(frame, [bar2, bar2 + BAR * 0.85], [-0.05 * width, 1.05 * width], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.45, 0, 0.55, 1),
  });
  const scanOn = frame >= bar2 && frame < bar2 + BAR * 0.9;

  return (
    <AbsoluteFill>
      <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <filter id="iris-glow" x="-3" y="-3" width="7" height="7">
            <feGaussianBlur stdDeviation={size * 0.9} />
          </filter>
        </defs>
        {CELLS.map((cell) => {
          const x = ox + cell.c * pitch;
          const y = oy + cell.r * pitch;
          const lead = cell.d === 0;
          // Bar 0: only the lead, blinking on each beat.
          if (frame < bar1) {
            if (!lead) return null;
            const inBeat = frame % BEAT;
            const blink = interpolate(inBeat, [0, 3, BEAT * 0.6, BEAT], [0.35, 1, 1, 0.35]);
            return <circle key={cell.i} cx={x} cy={y} r={size * 1.3} fill={ink.white} opacity={blink} />;
          }
          // Bar 1: the ripple out from the lead.
          const born = bar1 + (cell.d / MAX_D) * BAR * 0.75;
          const grow = interpolate(frame, [born, born + 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
          if (grow <= 0) return null;
          // Bar 2: behind the scan line, the dead fade to a faint gray.
          const passed = frame >= bar2 && x < scanX;
          const deadAt = bar2 + ((x + 0.05 * width) / (1.1 * width)) * BAR * 0.85;
          const die = cell.survives ? 0 : interpolate(frame, [deadAt, deadAt + 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          // Bar 3: the survivors light in iris.
          const k = LIGHT_ORDER.get(cell.i);
          const lit = k === undefined ? 0 : interpolate(frame, [bar3 + lightFrame(k), bar3 + lightFrame(k) + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const r = size * (lead && frame < bar1 + 12 ? 1.3 : 1) * grow * (1 - die * 0.45) * (1 + lit * 0.25);
          const fill = lit > 0 ? ink.iris : die > 0.5 ? ink.faint : passed && cell.survives ? ink.white : ink.white;
          const opacity = lit > 0 ? 1 : 1 - die * 0.75;
          return (
            <g key={cell.i}>
              {lit > 0 && <circle cx={x} cy={y} r={r * 2.4} fill={ink.irisGlow} opacity={lit} filter="url(#iris-glow)" />}
              <circle cx={x} cy={y} r={r} fill={fill} opacity={opacity} />
            </g>
          );
        })}
      </svg>
      {scanOn && (
        <div
          style={{
            position: 'absolute',
            left: scanX - 2,
            top: oy - pitch,
            height: (ROWS + 1) * pitch,
            width: 4,
            background: ink.white,
            boxShadow: `0 0 24px 6px oklch(1 0 0 / 0.35), -120px 0 140px -40px oklch(1 0 0 / 0.08)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
