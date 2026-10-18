/**
 * The film's timing, in one place. Every scene's start and length comes from
 * SCENES, so retiming to the music means editing this file only. Times are
 * written in seconds for now; once the track is picked, swap them for
 * `music.bar(n)` and `music.beat(n)` so cuts land on the beat.
 */
export const FPS = 60;

/** Seconds to frames at the film's rate. */
export const sec = (s: number) => Math.round(s * FPS);

/** Milliseconds to frames at the film's rate. */
export const msToFrames = (ms: number) => (ms / 1000) * FPS;

export interface Beats {
  bpm: number;
  /** Frames per beat (fractional; round where a frame number is needed). */
  framesPerBeat: number;
  /** The frame of a beat counted from the downbeat of bar 1 (beat 0). */
  beat: (n: number) => number;
  /** The frame of a bar and beat, both counted from 0 (bar 0 beat 0 is the first downbeat). */
  bar: (bar: number, beat?: number) => number;
  /** Length in frames of a number of beats. */
  beats: (n: number) => number;
}

/**
 * Converts tempo to frames. `offset` is the frame of the first downbeat (a
 * pickup or silence before the music starts).
 */
export function beats(bpm: number, { beatsPerBar = 4, offset = 0, fps = FPS } = {}): Beats {
  const framesPerBeat = (60 / bpm) * fps;
  const beat = (n: number) => Math.round(offset + n * framesPerBeat);
  return {
    bpm,
    framesPerBeat,
    beat,
    bar: (bar, b = 0) => beat(bar * beatsPerBar + b),
    beats: (n) => Math.round(n * framesPerBeat),
  };
}

/** Placeholder tempo until the track is chosen: 120 BPM makes a bar exactly 2 s. */
export const music = beats(120);

export type TakeName = 'journey' | 'command' | 'quick' | 'grab' | 'people' | 'drop' | 'agents' | 'ongoing';

export const TAKE_NAMES: TakeName[] = ['journey', 'command', 'quick', 'grab', 'people', 'drop', 'agents', 'ongoing'];

export interface Scene {
  from: number;
  duration: number;
}

const scene = (fromS: number, toS: number): Scene => ({ from: sec(fromS), duration: sec(toS) - sec(fromS) });

export const SCENES = {
  coldOpen: scene(0, 9),
  paste: scene(9, 16),
  start: scene(16, 22),
  results: scene(22, 33),
  opener: scene(33, 41),
  export: scene(41, 47),
  montage: scene(47, 60),
  pullBack: scene(60, 66),
  end: scene(66, 70),
} satisfies Record<string, Scene>;

/**
 * One montage cut per bar at the placeholder tempo. `word` is the cut's one
 * word of type, `rect` what the camera drifts toward, and `from` the moment of
 * the take the cut opens on (a mark the rig logged, plus ms).
 */
export interface MontageCut {
  take: TakeName;
  word: string;
  rect?: string;
  from?: { mark?: string; offset: number };
  rate?: number;
}

export const MONTAGE: MontageCut[] = [
  { take: 'command', word: 'Command.', rect: 'commandBar', from: { offset: 1100 } },
  { take: 'quick', word: 'Anywhere.', rect: 'quickWindow', from: { offset: 8000 } },
  { take: 'grab', word: 'Grab.', rect: 'grabBox', from: { mark: 'drag', offset: 300 }, rate: 1.5 },
  { take: 'people', word: 'People.', rect: 'personRow', from: { offset: 250 } },
  { take: 'drop', word: 'Drop.', from: { mark: 'over', offset: -200 }, rate: 1.2 },
  { take: 'agents', word: 'Agents.', rect: 'mcpPanel', from: { offset: 500 } },
  { take: 'ongoing', word: 'Ongoing.', rect: 'ongoing', from: { offset: 350 } },
];
/** Length of one montage cut: one bar. */
export const MONTAGE_CUT = music.beats(4);

export const DURATION = SCENES.end.from + SCENES.end.duration;

/**
 * The aura's strength over the whole film (absolute frames), so it flows
 * across cuts: it blooms in the cold open, rises when a search starts, holds
 * while results land, calms for the montage and settles for the end card.
 */
export const AURA_KEYS: [frame: number, intensity: number][] = [
  [0, 0],
  [sec(4.5), 0.75],
  [sec(9), 0.6],
  [sec(16.8), 0.6],
  [sec(19), 1.35],
  [sec(33), 1.1],
  [sec(41), 0.75],
  [sec(46), 0.85],
  [sec(60), 0.85],
  [sec(65), 0.55],
  [sec(68), 0.8],
  [DURATION, 0.72],
];
