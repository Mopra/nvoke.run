import type React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { CameraMotionBlur } from '@remotion/motion-blur';
import { markTime, TakesContext } from '../takes';
import { msToFrames } from '../timeline';
import { DotField, lightFrame, SURVIVORS } from '../teaser/DotField';
import { ink } from '../teaser/look';
import { COUNT_RATE, DotsHud, Ending, files, Sfx, Week, type TeaserProps } from '../teaser/Teaser';
import { BAR, BEAT, at } from '../teaser/timing';
import { Hud } from '../teaser/Type';
import { Finish } from './Finish';
import { Hero } from './Hero';
import { Lens } from './Lens';
import { Real } from './Real';
import { Words } from './Words';

/*
 * The teaser, finished like a studio would: the same bars, voice and sound,
 * on the dark finish of the app, through a real lens (3D camera, depth of
 * field, focus pulls, bloom), with grain, glitch tears on the glitch hits, a
 * camera that never stops moving, and one new bar: the hero, the whole panel
 * turning in the dark after the macro shots. Thirteen bars, about 31 s.
 */

export const STUDIO_BARS = 13;
export const STUDIO_DURATION = at(STUDIO_BARS);

/**
 * The world cut: one real world clip on each line of the voice, each held a
 * beat or two and cut back to the app on the grid. The clips are made
 * locally (docs/video.md, "Real world clips").
 */
export const WORLD_INSERTS: Insert[] = [
  { src: 'real/street.mp4', from: 0, length: at(0, 2), clipFrom: 0.3, push: [1.0, 1.06], out: 'teaser/sfx/thud.wav' },
  { src: 'real/city.mp4', from: at(1), length: at(0, 1.5), clipFrom: 0.2, push: [1.0, 1.05] },
  { src: 'real/press.mp4', from: at(4), length: at(0, 1), clipFrom: 0.2, push: [1.0, 1.04] },
  { src: 'real/server.mp4', from: at(5), length: at(0, 1), clipFrom: 0.4, push: [1.02, 1.08] },
  { src: 'real/pen.mp4', from: at(6), length: at(0, 1), clipFrom: 0.5, push: [1.02, 1.07] },
  { src: 'real/letterbox.mp4', from: at(9, 2.5), length: at(0, 1), clipFrom: 0.3, push: [1.0, 1.05] },
  { src: 'real/shutter.mp4', from: at(10), length: at(0, 1.25), clipFrom: 0.6, push: [1.0, 1.05] },
  { src: 'real/magnet.mp4', from: at(11), length: at(0, 2), clipFrom: 0.2, push: [1.04, 1.0], out: 'teaser/sfx/tick.wav' },
];
/** The bar the hero sits in; every bar after it is the teaser's, one later. */
const HERO = 7;
const TAKE = 'takes/journey-dark.mp4';

/** A real world clip laid over the film for a beat or two, cutting back to the app on the grid. */
export interface Insert {
  /** The clip in public/, e.g. real/server.mp4. */
  src: string;
  /** Film frames: where it starts and how long it holds. */
  from: number;
  length: number;
  /** Seconds into the clip it opens on. */
  clipFrom?: number;
  push?: [number, number];
  /** A sound on the cut back to the app. */
  out?: string;
}

export interface StudioProps extends TeaserProps {
  inserts?: Insert[];
}

const shot = (from: number, length: number, node: React.ReactNode, name: string) => (
  <Sequence from={from} durationInFrames={length} name={name} premountFor={90}>
    {node}
  </Sequence>
);

const idx = (bar: number) => `${String(bar + 1).padStart(2, '0')} / ${STUDIO_BARS}`;

/** Bars 0 to 3: the camera creeps into the dots the whole time. */
const Dots: React.FC = () => {
  const frame = useCurrentFrame();
  const push = interpolate(frame, [0, at(4)], [1, 1.12], { easing: Easing.bezier(0.4, 0, 0.6, 1) });
  const sway = interpolate(frame, [0, at(4)], [-0.6, 0.4]);
  return (
    <AbsoluteFill style={{ transform: `scale(${push}) rotate(${sway}deg)` }}>
      <DotField />
    </AbsoluteFill>
  );
};

export const Studio: React.FC<StudioProps> = ({ takes, voice, inserts = [] }) => {
  const have = files();
  const journey = takes['journey-dark'].take;
  const counters = journey.rects['counters'];
  const opener = journey.rects['opener'];
  const keys = journey.events.filter((e) => e.type === 'key');
  const firstKey = keys[0]?.t ?? markTime(journey, 'paste') + 600;
  const typeFrom = firstKey - 450;
  const keyFrames = keys.filter((e) => e.t >= typeFrom && e.t < typeFrom + (BAR / 60) * 1000).map((e) => at(4) + Math.round(msToFrames(e.t - typeFrom)));
  const v = (line: string) => `teaser/voice/${voice}/${line}.wav`;
  // A bar of the teaser after the hero lands one bar later.
  const late = (bar: number, beat = 0) => at(bar >= HERO ? bar + 1 : bar, beat);

  return (
    <TakesContext.Provider value={takes}>
      <Finish glitches={[at(5), at(6), at(HERO)]}>
        {shot(0, at(4), <Dots />, 'Dots')}
        {shot(0, at(4), <DotsHud total={STUDIO_BARS} />, 'Dots HUD')}
        {shot(
          at(4),
          BAR,
          <>
            <Lens src={TAKE} duration={BAR} startFrom={typeFrom} focus={{ x: 1250, y: 668 }} zoom={[1.7, 2.1]} drift={{ x: 300, y: 0 }} pitch={12} yaw={[-9, -3]} />
            <Hud index={idx(4)} label="paste your site" />
          </>,
          'Typing',
        )}
        {shot(
          at(5),
          BAR,
          <>
            <Lens
              src={TAKE}
              duration={BAR}
              startFrom={markTime(journey, 'first-row') + 3000}
              playbackRate={COUNT_RATE}
              focus={{ x: counters ? counters.x + counters.w * 0.76 : 1750, y: counters ? counters.y + counters.h * 0.62 : 846 }}
              zoom={[1.95, 2.25]}
              drift={{ x: 220, y: 0 }}
              pitch={18}
              yaw={[6, 1]}
              band={0.26}
            />
            <Hud index={idx(5)} label="asks the mail server" />
          </>,
          'Verify',
        )}
        {shot(
          at(6),
          BAR,
          <>
            <Lens
              src={TAKE}
              duration={BAR}
              startFrom={markTime(journey, 'openers') + 300}
              focus={{ x: 420, y: opener ? opener.y + opener.h / 2 : 887 }}
              zoom={[2.05, 2.35]}
              drift={{ x: 380, y: 0 }}
              pitch={16}
              yaw={[-8, -2]}
              band={0.16}
            />
            <Hud index={idx(6)} label="writes the first line" />
          </>,
          'Opener',
        )}
        {shot(
          at(HERO),
          BAR,
          <>
            <Hero src={TAKE} startFrom={markTime(journey, 'done') - 1600} duration={BAR} />
            <Hud index={idx(HERO)} label="the whole panel" />
          </>,
          'Hero',
        )}
        {shot(late(7), BAR, <><Words text="WE FIND." /><Hud index={idx(8)} label="nvoke" /></>, 'We find')}
        {shot(late(8), BAR, <><Words text="YOU SEND." color={ink.signal} glow={ink.signalGlow} /><Hud index={idx(9)} label="you" /></>, 'You send')}
        {shot(late(9), BAR, <><Week /><Hud index={idx(10)} label="drops, daily" /></>, 'Week')}
        {shot(
          late(10),
          STUDIO_DURATION - late(10),
          <CameraMotionBlur samples={8} shutterAngle={180}>
            <Ending />
          </CameraMotionBlur>,
          'Ending',
        )}
        {inserts.map((x) => shot(x.from, x.length, <Real src={x.src} from={x.clipFrom} length={x.length} push={x.push} />, x.src))}
      </Finish>
      {inserts.map((x) => (x.out ? <Sfx key={`out-${x.src}`} have={have} src={x.out} from={x.from + x.length} volume={0.7} /> : null))}

      {/* The beat: the teaser's twelve bars with bar 6 played twice under the hero. */}
      <Sfx have={have} src="teaser/beat.wav" from={0} volume={0.8} trimAfter={at(HERO)} />
      <Sfx have={have} src="teaser/beat.wav" from={at(HERO)} volume={0.8} trimBefore={at(HERO - 1)} trimAfter={at(HERO)} />
      <Sfx have={have} src="teaser/beat.wav" from={at(HERO + 1)} volume={0.8} trimBefore={at(HERO)} />
      <Sfx have={have} src="teaser/sfx/hum.wav" from={0} volume={0.25} />
      <Sfx have={have} src="teaser/sfx/roll.wav" from={at(1)} volume={0.6} />
      <Sfx have={have} src="teaser/sfx/thud.wav" from={at(2)} volume={0.9} />
      <Sfx have={have} src="teaser/sfx/scan.wav" from={at(2)} volume={0.55} />
      {Array.from({ length: 16 }, (_, k) => (
        <Sfx key={`p${k}`} have={have} src={k % 4 === 3 ? 'teaser/sfx/ping_hi.wav' : 'teaser/sfx/ping.wav'} from={at(3) + Math.round(lightFrame(k * Math.ceil(SURVIVORS.length / 16)))} volume={k === 0 ? 0.9 : 0.4} />
      ))}
      {keyFrames.map((f, i) => (
        <Sfx key={`k${i}`} have={have} src={`teaser/sfx/${['key', 'key2', 'key3'][i % 3]}.wav`} from={f} volume={0.8} />
      ))}
      <Sfx have={have} src="teaser/sfx/glitch.wav" from={at(5)} volume={0.6} />
      <Sfx have={have} src="teaser/sfx/ping_hi.wav" from={at(5, 2)} volume={0.9} />
      <Sfx have={have} src="teaser/sfx/glitch.wav" from={at(6)} volume={0.5} />
      {/* The hero: a glitch out of the macro, the sub drop, air as the panel turns. */}
      <Sfx have={have} src="teaser/sfx/glitch.wav" from={at(HERO)} volume={0.45} />
      <Sfx have={have} src="teaser/sfx/drop.wav" from={at(HERO)} volume={0.7} />
      <Sfx have={have} src="teaser/sfx/air.wav" from={at(HERO) - 6} volume={0.5} />
      {[...'WE FIND.'].map((ch, i) => (ch === ' ' ? null : <Sfx key={`w${i}`} have={have} src="teaser/sfx/tick.wav" from={late(7) + Math.round((i * BEAT) / 4)} volume={0.9} />))}
      {[...'YOU SEND.'].map((ch, i) => (ch === ' ' ? null : <Sfx key={`y${i}`} have={have} src="teaser/sfx/tick.wav" from={late(8) + Math.round((i * BEAT) / 4)} volume={0.9} />))}
      <Sfx have={have} src="teaser/sfx/magnet.wav" from={late(11) - 26} volume={1} />

      {/* The voice. */}
      <Sfx have={have} src={v('l01')} from={at(0, 1)} />
      <Sfx have={have} src={v('l02')} from={at(1, 1)} />
      <Sfx have={have} src={v('l03')} from={at(2, 1)} />
      <Sfx have={have} src={v('l04')} from={at(3, 0.5)} />
      <Sfx have={have} src={v('l05')} from={at(4, 2)} />
      <Sfx have={have} src={v('l06')} from={at(5, 1)} />
      <Sfx have={have} src={v('l07')} from={at(6, 1)} />
      <Sfx have={have} src={v('l08')} from={late(8, 1)} />
      <Sfx have={have} src={v('l09')} from={late(11, 1)} />
    </TakesContext.Provider>
  );
};
