'use client';

import { Check, Download } from 'lucide-react';
import { DENTISTS, SEARCHES, type MockSearch } from '@/components/mockups/data';
import { MockButton, Pointer, SearchBar, StatusDot } from '@/components/mockups/primitives';
import {
  CommandBar,
  CompanyRow,
  NewSearchForm,
  ResultsScreen,
  SearchesScreen,
  SearchRow,
  type ResultsLive,
  type RowPhase,
} from '@/components/mockups/screens';
import { typing, useTimeline } from '@/components/mockups/use-timeline';
import { AppWindow } from '@/components/mockups/window';
import { cn } from '@/lib/utils';

// The mockups in use: short scripted scenes that play while they are on
// screen. Each one is a list of frames (a state and how long it holds),
// stepped by useTimeline. The pictures themselves stay in screens.tsx.

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const phaseAt = (tick: number, start: number): RowPhase => clamp(Math.floor(tick - start), 0, 3) as RowPhase;

/* New search: the sentence types itself, the pointer presses Start, results arrive. */

type FormFrame = {
  ms: number;
  values: [string, string];
  focus: number | null;
  pointer: 'off' | 'away' | 'on' | 'press';
  results: number | null;
};

const WHAT = 'dentists';
const WHERE = 'Austin';
const FORM_TICKS = 7;

const FORM_FRAMES: FormFrame[] = [
  { ms: 1100, values: ['', ''], focus: 0, pointer: 'off', results: null },
  ...typing(WHAT).map((t): FormFrame => ({ ms: t.ms, values: [t.text, ''], focus: 0, pointer: 'off', results: null })),
  { ms: 420, values: [WHAT, ''], focus: 0, pointer: 'off', results: null },
  ...typing(WHERE, 95).map(
    (t): FormFrame => ({ ms: t.ms, values: [WHAT, t.text], focus: 1, pointer: 'off', results: null }),
  ),
  // The still: the form filled in, as the server draws it.
  { ms: 500, values: [WHAT, WHERE], focus: 1, pointer: 'off', results: null },
  { ms: 60, values: [WHAT, WHERE], focus: 1, pointer: 'away', results: null },
  { ms: 820, values: [WHAT, WHERE], focus: 1, pointer: 'on', results: null },
  { ms: 200, values: [WHAT, WHERE], focus: null, pointer: 'press', results: null },
  { ms: 260, values: [WHAT, WHERE], focus: null, pointer: 'on', results: null },
  ...Array.from({ length: FORM_TICKS }, (_, i): FormFrame => ({
    ms: i === FORM_TICKS - 1 ? 3600 : 520,
    values: [WHAT, WHERE],
    focus: null,
    pointer: 'off',
    results: i,
  })),
];
const FORM_DURATIONS = FORM_FRAMES.map((f) => f.ms);
const FORM_STILL = 2 + WHAT.length + WHERE.length;

/** The first how-it-works shot: a panel with the composer, then its search. */
export function NewSearchScene() {
  const { ref, step } = useTimeline(FORM_DURATIONS, { loop: true, still: FORM_STILL });
  const f = FORM_FRAMES[step] ?? FORM_FRAMES[FORM_STILL]!;
  const tick = f.results ?? 0;
  const progress = (tick + 1) / FORM_TICKS;
  return (
    <div ref={ref} className="relative size-full">
      <div className="mock-view absolute inset-0" data-active={f.results === null}>
        <NewSearchForm
          values={f.values}
          focus={f.focus}
          pressed={f.pointer === 'press'}
          pointer={
            <Pointer
              x={f.pointer === 'away' || f.pointer === 'off' ? 230 : 96}
              y={f.pointer === 'away' || f.pointer === 'off' ? -150 : 24}
              pressed={f.pointer === 'press'}
              visible={f.pointer !== 'off'}
            />
          }
        />
      </div>
      <div className="mock-view absolute inset-0" data-active={f.results !== null}>
        <div className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.03em]">Dentists in Austin</div>
        <div className="mt-2 flex items-center gap-2.5 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
            <StatusDot status="running" />
            Running
          </span>
          Local businesses, just now
        </div>
        <SearchBar
          search={{ ...SEARCHES[0]!, found: lerp(14, 70, progress), crawled: lerp(4, 52, progress) }}
          className="mt-6 h-[3px]"
        />
        <div className="-mx-6 mt-3">
          {DENTISTS.map((c, i) => (
            <CompanyRow key={c.domain} company={c} location={false} phase={phaseAt(tick + 1, i * 1.5)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Searches: a new search lands on top, runs, and finishes. */

type ListFrame = { ms: number; added: boolean; search: MockSearch; summary: string };

const BASE = SEARCHES[0]!;
const run = (found: number, crawled: number, done: number, total: number, emails: number, valid: number) => ({
  ...BASE,
  found,
  crawled,
  caption: `${done} of ${total} websites crawled`,
  emails,
  valid,
});

const LIST_FRAMES: ListFrame[] = [
  { ms: 1500, added: false, search: run(4, 0, 0, 3, 0, 0), summary: '4 searches' },
  { ms: 900, added: true, search: run(10, 0, 0, 8, 0, 0), summary: '5 searches, 1 running' },
  { ms: 800, added: true, search: run(24, 8, 4, 19, 5, 2), summary: '5 searches, 1 running' },
  { ms: 800, added: true, search: run(38, 18, 13, 30, 17, 7), summary: '5 searches, 1 running' },
  // The still: SEARCHES[0] exactly, as the shot's label describes it.
  { ms: 900, added: true, search: BASE, summary: '5 searches, 1 running' },
  { ms: 800, added: true, search: run(72, 52, 38, 58, 49, 22), summary: '5 searches, 1 running' },
  { ms: 800, added: true, search: run(88, 74, 51, 66, 62, 28), summary: '5 searches, 1 running' },
  { ms: 800, added: true, search: run(100, 94, 64, 68, 71, 33), summary: '5 searches, 1 running' },
  {
    ms: 4200,
    added: true,
    search: { ...BASE, status: 'done', found: 100, crawled: 100, caption: '68 companies, 68 crawled', emails: 74, valid: 35 },
    summary: '5 searches',
  },
];
const LIST_DURATIONS = LIST_FRAMES.map((f) => f.ms);
const LIST_STILL = 4;

/** The second how-it-works shot: the searches list with one running. */
export function SearchesScene() {
  const { ref, step } = useTimeline(LIST_DURATIONS, { loop: true, still: LIST_STILL });
  const f = LIST_FRAMES[step] ?? LIST_FRAMES[LIST_STILL]!;
  return (
    <div ref={ref}>
      <div className="pb-4">
        <div className="font-display text-[34px] leading-[40px] font-semibold tracking-[-0.03em]">Searches</div>
        <div className="mt-1 text-[13px] text-muted-foreground tabular-nums">{f.summary}</div>
      </div>
      <div className="-mx-5 flex flex-col">
        <div className={cn('mock-fold', f.added && 'mock-fold-open')}>
          <div className="min-h-0 overflow-hidden pb-1">
            <SearchRow index={0} compact search={f.search} />
          </div>
        </div>
        <SearchRow index={1} compact />
        <SearchRow index={3} compact />
      </div>
    </div>
  );
}

/* Results: the companies resolve, then the pointer exports the CSV. */

type ExportFrame = { ms: number; tick: number; pointer: 'off' | 'away' | 'on' | 'press'; saved: boolean };
const EXPORT_TICKS = 6;
const EXPORT_FRAMES: ExportFrame[] = [
  ...Array.from({ length: EXPORT_TICKS }, (_, i): ExportFrame => ({
    ms: i === 0 ? 700 : 520,
    tick: i,
    pointer: 'off',
    saved: false,
  })),
  { ms: 700, tick: EXPORT_TICKS, pointer: 'off', saved: false },
  { ms: 60, tick: EXPORT_TICKS, pointer: 'away', saved: false },
  { ms: 820, tick: EXPORT_TICKS, pointer: 'on', saved: false },
  { ms: 200, tick: EXPORT_TICKS, pointer: 'press', saved: false },
  { ms: 2200, tick: EXPORT_TICKS, pointer: 'on', saved: true },
  { ms: 2600, tick: EXPORT_TICKS, pointer: 'off', saved: false },
];
const EXPORT_DURATIONS = EXPORT_FRAMES.map((f) => f.ms);

/** The third how-it-works shot: verified emails, ready to export. */
export function ExportScene() {
  const { ref, step } = useTimeline(EXPORT_DURATIONS, { loop: true });
  const f = EXPORT_FRAMES[step] ?? EXPORT_FRAMES[EXPORT_FRAMES.length - 1]!;
  return (
    <div ref={ref}>
      <div className="flex items-start gap-4 pb-4">
        <div className="min-w-0 flex-1">
          <div className="font-display text-[28px] leading-[34px] font-semibold tracking-[-0.026em]">
            Dentists in Austin
          </div>
          <div className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {lerp(0, 46, f.tick / EXPORT_TICKS)} valid of {lerp(0, 83, Math.min(1, (f.tick + 1) / EXPORT_TICKS))}
          </div>
        </div>
        <span className="relative">
          <MockButton
            icon={f.saved ? Check : Download}
            className={cn('mock-press', f.pointer === 'press' && 'scale-[0.96] brightness-110')}
          >
            {f.saved ? 'Saved' : 'Export CSV'}
          </MockButton>
          <Pointer
            x={f.pointer === 'away' || f.pointer === 'off' ? -150 : 70}
            y={f.pointer === 'away' || f.pointer === 'off' ? 170 : 18}
            pressed={f.pointer === 'press'}
            visible={f.pointer !== 'off'}
          />
        </span>
      </div>
      <div className="-mx-8">
        {DENTISTS.slice(0, 2).map((c, i) => (
          <CompanyRow key={c.domain} company={c} location={false} phase={phaseAt(f.tick + 1, i * 2)} />
        ))}
      </div>
    </div>
  );
}

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
  // The first three rows were in before the page loaded; the rest stream in.
  const phases = Array.from({ length: 7 }, (_, i) => (i < 3 ? undefined : phaseAt(tick, 1 + (i - 3) * 2)));
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
