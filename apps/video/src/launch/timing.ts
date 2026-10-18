import { FPS } from '../timeline';

/**
 * The launch cut runs on the music's grid: one idea per bar. The track's beat
 * and drop were measured with librosa (tempo 92.29 BPM, the drop on the beat
 * at 13.769 s). The offset starts the track so the drop lands on bar 3, the
 * moment nvoke starts reading the site. Change the track: measure again and
 * set these three numbers.
 *
 * Tracks are not in git (apps/video/public/music is ignored). This one is
 * "Minimal Technology" from Pixabay (pixabay.com/music/beats-minimal-technology-345194),
 * free for commercial use under the Pixabay Content License: download its MP3
 * to public/music/minimal-technology.mp3.
 */
export const MUSIC = {
  file: 'music/minimal-technology.mp3',
  bpm: 92.285,
  drop: 13.769,
  /** Seconds into the track at frame 0. */
  get offset() {
    return this.drop - 3 * (240 / this.bpm);
  },
};

/** Frames per beat and per bar (4 beats). */
export const BEAT = (60 / MUSIC.bpm) * FPS;
export const BAR = Math.round(BEAT * 4);

/** The frame bar `n` starts on. */
export const bar = (n: number) => Math.round(n * BEAT * 4);

/** Ten bars of story and a held end card. */
export const LAUNCH_DURATION = bar(10) + Math.round(3.2 * FPS);
