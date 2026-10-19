'use client';

import { useInView, useTicker } from '@/components/site/home/motion';
import { cn } from '@/lib/utils';

/*
 * The hero's backdrop: a huge dot matrix agent, every dot a square on a
 * faint grid of ghost dots, like the figures on the display. Its eyes scan
 * left and right and blink, its mouth flickers like a level meter while it
 * talks to the API, the antenna LED blinks orange. Scenery: aria-hidden and
 * deterministic, so server and client draw the same first frame.
 */

const COLS = 48;
const ROWS = 26;
const CELL = 10;
const DOT = 7;

type Dot = [number, number];

function rect(x0: number, y0: number, w: number, h: number): Dot[] {
  const out: Dot[] = [];
  for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) out.push([x, y]);
  return out;
}

/** The head: an outline with clipped corners, ears and the antenna stalk. Never changes. */
const HEAD: Dot[] = (() => {
  const out: Dot[] = [];
  const [l, r, t, b] = [10, 37, 6, 21];
  for (let x = l + 1; x < r; x++) out.push([x, t], [x, b]);
  for (let y = t + 1; y < b; y++) out.push([l, y], [r, y]);
  out.push(...rect(7, 11, 2, 5), ...rect(39, 11, 2, 5), ...rect(23, 3, 2, 3));
  return out;
})();

/** Where the eyes look over one cycle, in columns. */
const SCAN = [0, 0, 0, 0, 0, 0, -1, -2, -2, -2, -2, -2, -1, 0, 0, 0, 1, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0];

function hash(n: number): number {
  return ((n * 2654435761) >>> 0) % 997;
}

export function AgentFace({ className }: { className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>('0px');
  const tick = useTicker(130, inView, 0);

  const look = SCAN[Math.floor(tick / 2) % SCAN.length]!;
  const blink = tick % 47 === 20 || tick % 47 === 21;
  const talking = tick > 0 && tick % 36 < 22;

  const eyes: Dot[] = blink
    ? [...rect(15 + look, 12, 5, 1), ...rect(28 + look, 12, 5, 1)]
    : [...rect(15 + look, 10, 5, 4), ...rect(28 + look, 10, 5, 4)];

  // The mouth: a flat line at rest, a level meter while it talks.
  const mouth: Dot[] = [];
  for (let x = 17; x <= 30; x++) {
    const level = talking ? hash(x * 31 + Math.floor(tick / 2) * 7) % 3 : 0;
    for (let y = 17 - level; y <= 17 + level; y++) mouth.push([x, y]);
  }

  const antennaOn = tick % 8 < 5;

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn(
        'pointer-events-none select-none text-foreground [mask-image:radial-gradient(ellipse_at_50%_40%,black_35%,transparent_75%)]',
        className,
      )}
    >
      <svg viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`} className="block h-auto w-full">
        <defs>
          <pattern id="agent-face-ghost" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            <rect x={1.5} y={1.5} width={DOT} height={DOT} rx={1} fill="currentColor" opacity={0.03} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agent-face-ghost)" />
        <g fill="currentColor">
          {HEAD.map(([x, y]) => (
            <rect key={`h${x}.${y}`} x={x * CELL + 1.5} y={y * CELL + 1.5} width={DOT} height={DOT} rx={1} opacity={0.06} />
          ))}
          {mouth.map(([x, y]) => (
            <rect key={`m${x}.${y}`} x={x * CELL + 1.5} y={y * CELL + 1.5} width={DOT} height={DOT} rx={1} opacity={0.075} />
          ))}
          {eyes.map(([x, y]) => (
            <rect key={`e${x}.${y}`} x={x * CELL + 1.5} y={y * CELL + 1.5} width={DOT} height={DOT} rx={1} opacity={0.1} />
          ))}
        </g>
        <g fill="var(--primary)" opacity={antennaOn ? 0.45 : 0.12} style={{ transition: 'opacity 120ms' }}>
          {rect(22, 1, 4, 2).map(([x, y]) => (
            <rect key={`a${x}.${y}`} x={x * CELL + 1.5} y={y * CELL + 1.5} width={DOT} height={DOT} rx={1} />
          ))}
        </g>
      </svg>
    </div>
  );
}
