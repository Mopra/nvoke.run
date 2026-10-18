'use client';

import {
  CommandBar,
  ResultsScreen,
  SearchesScreen,
  type ResultsLive,
  type RowPhase,
} from '@/components/mockups/screens';
import { typing, useTimeline } from '@/components/mockups/use-timeline';
import { AppWindow } from '@/components/mockups/window';

// The mockups in use: short scripted scenes that play while they are on
// screen. Each one is a list of frames (a state and how long it holds),
// stepped by useTimeline. The pictures themselves stay in screens.tsx.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const phaseAt = (tick: number, start: number): RowPhase => clamp(Math.floor(tick - start), 0, 3) as RowPhase;

/* The hero: a search mid run. Rows stream in and verify, the figures climb. Plays once. */

const HERO_TICKS = 10;
const HERO_DURATIONS = Array.from({ length: HERO_TICKS + 1 }, (_, i) => (i === 0 ? 1100 : 560));
const HERO_START: Omit<ResultsLive, 'phases'> = {
  companies: 34,
  crawled: 29,
  emails: 41,
  valid: 18,
  found: 42,
  crawledBar: 36,
  seconds: 11,
};
const HERO_END: Omit<ResultsLive, 'phases'> = {
  companies: 70,
  crawled: 69,
  emails: 91,
  valid: 42,
  found: 92,
  crawledBar: 86,
  seconds: 17,
};

function heroFrame(tick: number): ResultsLive {
  const t = tick / HERO_TICKS;
  const k = Object.fromEntries(
    (Object.keys(HERO_END) as (keyof typeof HERO_END)[]).map((key) => [key, lerp(HERO_START[key], HERO_END[key], t)]),
  ) as Omit<ResultsLive, 'phases'>;
  // People rows are tall, so only the first was in before the page loaded; the rest stream in where they show.
  const phases = Array.from({ length: 7 }, (_, i) => (i < 1 ? undefined : phaseAt(tick, 1 + (i - 1) * 2)));
  return { ...k, phases };
}

/** Windows 11 window on a running search, in motion. The hero shot. */
export function ResultsWindowScene() {
  const { ref, step } = useTimeline(HERO_DURATIONS, { ssr: 0, threshold: 0.2 });
  return (
    <div ref={ref} className="size-full">
      <AppWindow platform="windows" live>
        <ResultsScreen platform="windows" animate live={heroFrame(step)} />
      </AppWindow>
    </div>
  );
}

/* The command bar: it opens from the island, a query types, the searches filter. */

type CommandFrame = { ms: number; open: boolean; query: string };
const COMMAND_FRAMES: CommandFrame[] = [
  { ms: 1400, open: false, query: '' },
  { ms: 900, open: true, query: '' },
  ...typing('dent', 150).map((t): CommandFrame => ({ ms: t.ms, open: true, query: t.text })),
  { ms: 3400, open: true, query: 'dent' },
  { ms: 700, open: false, query: 'dent' },
];
const COMMAND_DURATIONS = COMMAND_FRAMES.map((f) => f.ms);
const COMMAND_STILL = COMMAND_FRAMES.length - 2;

/** macOS window on the searches list, with the command bar opening from the island. */
export function CommandWindowScene() {
  const { ref, step } = useTimeline(COMMAND_DURATIONS, { loop: true, still: COMMAND_STILL });
  const f = COMMAND_FRAMES[step] ?? COMMAND_FRAMES[COMMAND_STILL]!;
  return (
    <div ref={ref} className="size-full">
      <AppWindow
        platform="mac"
        live
        overlay={
          <>
            <div className="mock-scrim absolute inset-0 bg-scrim/50 backdrop-blur-[6px]" data-open={f.open} />
            <div className="mock-pop absolute top-[10px] left-1/2 -translate-x-1/2" data-open={f.open}>
              <CommandBar query={f.query} />
            </div>
          </>
        }
      >
        <SearchesScreen platform="mac" />
      </AppWindow>
    </div>
  );
}
