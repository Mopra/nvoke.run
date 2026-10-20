import type React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { markTime, TakesContext } from '../takes';
import { COUNT_RATE, Ending, files, Sfx, type TeaserProps } from '../teaser/Teaser';
import { BAR, at } from '../teaser/timing';
import { Hud } from '../teaser/Type';
import { Finish } from './Finish';
import { Lens } from './Lens';

/*
 * A test reel for the real world idea: generated clips (public/real, made
 * locally with ComfyUI and Wan 2.2) cut against the app on the beat. A
 * street wakes up, the nvoke device's display wakes and match cuts to the
 * app's counters, the key is pressed and smash cuts into the app, the logo.
 * Five bars, 12 s. Not a film yet: a look at how the two worlds mix.
 */

export const REEL_DURATION = at(5);
const TAKE = 'takes/journey-dark.mp4';

/** A generated clip, graded into the film: cooler, a touch of contrast, a slow push. */
const Real: React.FC<{ src: string; from?: number; rate?: number; push?: [number, number]; length: number }> = ({ src, from = 0, rate = 1, push = [1.02, 1.1], length }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, length], push, { extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1) });
  const fade = interpolate(frame, [0, 4], [0.4, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'black', opacity: fade }}>
      <OffthreadVideo
        src={staticFile(src)}
        trimBefore={Math.round(from * 60)}
        playbackRate={rate}
        muted
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${s})`, filter: 'saturate(0.8) contrast(1.1) brightness(0.92)' }}
      />
    </AbsoluteFill>
  );
};

const shot = (from: number, length: number, node: React.ReactNode, name: string) => (
  <Sequence from={from} durationInFrames={length} name={name} premountFor={60}>
    {node}
  </Sequence>
);

/** Where each cut lands inside its bar, in frames: the match cuts sit on beat 3. */
const DISPLAY_CUT = at(0, 2);
const PRESS_CUT = at(0, 2);

export const Reel: React.FC<TeaserProps> = ({ takes }) => {
  const have = files();
  const journey = takes['journey-dark'].take;
  const counters = journey.rects['counters'];

  return (
    <TakesContext.Provider value={takes}>
      <Finish glitches={[at(2) + PRESS_CUT]}>
        {shot(0, BAR, <><Real src="real/street.mp4" from={0.4} length={BAR} push={[1.0, 1.08]} /><Hud index="01 / 05" label="06:12, a street of leads" /></>, 'Street')}
        {shot(at(1), DISPLAY_CUT, <><Real src="real/display.mp4" from={0.6} length={DISPLAY_CUT} push={[1.04, 1.1]} /><Hud index="02 / 05" label="nvoke wakes" /></>, 'Display')}
        {shot(
          at(1) + DISPLAY_CUT,
          BAR - DISPLAY_CUT,
          <>
            <Lens
              src={TAKE}
              duration={BAR - DISPLAY_CUT}
              startFrom={markTime(journey, 'first-row') + 3000}
              playbackRate={COUNT_RATE}
              focus={{ x: counters ? counters.x + counters.w * 0.76 : 1750, y: counters ? counters.y + counters.h * 0.62 : 846 }}
              zoom={[2.1, 2.3]}
              drift={{ x: 160, y: 0 }}
              pitch={18}
              yaw={[4, 1]}
              band={0.26}
            />
            <Hud index="02 / 05" label="asks the mail server" />
          </>,
          'Counters',
        )}
        {shot(at(2), PRESS_CUT, <><Real src="real/press.mp4" from={0} length={PRESS_CUT} push={[1.0, 1.06]} /><Hud index="03 / 05" label="one key" /></>, 'Press')}
        {shot(
          at(2) + PRESS_CUT,
          BAR - PRESS_CUT,
          <>
            <Lens src={TAKE} duration={BAR - PRESS_CUT} startFrom={markTime(journey, 'openers') + 300} focus={{ x: 420, y: journey.rects['opener'] ? journey.rects['opener'].y + 17 : 887 }} zoom={[2.1, 2.35]} drift={{ x: 320, y: 0 }} pitch={16} yaw={[-8, -3]} band={0.16} />
            <Hud index="03 / 05" label="writes the first line" />
          </>,
          'Opener',
        )}
        {shot(at(3), at(2), <Ending />, 'Ending')}
      </Finish>

      {/* Sound: the beat's ticks under the street, its groove under the app, its stop under the logo. */}
      <Sfx have={have} src="teaser/beat.wav" from={0} volume={0.8} trimAfter={at(1)} />
      <Sfx have={have} src="teaser/beat.wav" from={at(1)} volume={0.8} trimBefore={at(4)} trimAfter={at(6)} />
      <Sfx have={have} src="teaser/beat.wav" from={at(3)} volume={0.8} trimBefore={at(10)} />
      <Sfx have={have} src="teaser/sfx/hum.wav" from={0} volume={0.3} />
      <Sfx have={have} src="teaser/sfx/scan.wav" from={at(0, 1)} volume={0.35} />
      <Sfx have={have} src="teaser/sfx/roll.wav" from={at(1)} volume={0.5} />
      <Sfx have={have} src="teaser/sfx/thud.wav" from={at(1) + DISPLAY_CUT} volume={0.8} />
      <Sfx have={have} src="teaser/sfx/ping_hi.wav" from={at(1, 3)} volume={0.8} />
      <Sfx have={have} src="teaser/sfx/key.wav" from={at(2) + PRESS_CUT - 4} volume={1} />
      <Sfx have={have} src="teaser/sfx/glitch.wav" from={at(2) + PRESS_CUT} volume={0.55} />
      <Sfx have={have} src="teaser/sfx/drop.wav" from={at(2) + PRESS_CUT} volume={0.6} />
      <Sfx have={have} src="teaser/sfx/magnet.wav" from={at(4) - 26} volume={1} />
      <Sfx have={have} src="teaser/voice/af_heart/l09.wav" from={at(4, 1)} />
    </TakesContext.Provider>
  );
};
