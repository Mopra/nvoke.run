import { FPS } from '../timeline';

/**
 * The teaser runs on its own beat (public/teaser/beat.wav, made by
 * scripts/teaser-audio.py): 100 BPM, 12 bars of 4. One shot per bar, sounds
 * on the grid. The beat stops on bar 11's downbeat so the logo lands in
 * silence.
 */
export const BPM = 100;
export const BEAT = (60 / BPM) * FPS;
export const BAR = BEAT * 4;

/** The frame of bar `n`, beat `b` (both from 0; fractions allowed for 16ths). */
export const at = (n: number, b = 0) => Math.round(n * BAR + b * BEAT);

export const TEASER_DURATION = at(12);
