import type React from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, getStaticFiles, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { LogoMark } from '../components/LogoMark';
import { markTime, TakesContext, type Takes } from '../takes';
import { msToFrames } from '../timeline';
import { DotField, lightFrame, SURVIVORS } from './DotField';
import { ink, type } from './look';
import { Macro } from './Macro';
import { BAR, BEAT, at, TEASER_DURATION } from './timing';
import { DotWords, Hud } from './Type';

/*
 * The teaser: about 29 s, black, dots and sound. A lead is a dot; three
 * hundred dots; most of them are dead; nvoke finds the ones that answer. Then
 * macro shots of the real app doing it, dot matrix words, and the magnet
 * pulling the dot in. A deadpan voice says as little as it can.
 */

export interface TeaserProps extends Record<string, unknown> {
  takes: Takes;
  /** Which voice's lines to use, a folder in public/teaser/voice. */
  voice: string;
}

/** Master level: the parts stack (beat, sub, voice, pings), so the whole mix sits below full scale. */
export const MIX = 0.62;

export const files = () => new Set(getStaticFiles().map((f) => f.name.replace(/\\/g, '/').replace(/^\/+/, '')));

/** A sound at a frame, skipped quietly while the kit is not generated yet. */
export const Sfx: React.FC<{ src: string; from: number; volume?: number; have: Set<string>; trimBefore?: number; trimAfter?: number }> = ({ src, from, volume = 1, have, trimBefore, trimAfter }) =>
  have.has(src) ? (
    <Sequence from={from} layout="none" name={src}>
      <Audio src={staticFile(src)} volume={volume * MIX} trimBefore={trimBefore} trimAfter={trimAfter} />
    </Sequence>
  ) : null;

const shot = (from: number, length: number, node: React.ReactNode, name: string) => (
  <Sequence from={from} durationInFrames={length} name={name} premountFor={90}>
    {node}
  </Sequence>
);

/** Bars 0 to 3: the counter in the corner follows the dots. */
export const DotsHud: React.FC<{ total?: number }> = ({ total = 12 }) => {
  const frame = useCurrentFrame();
  const survivors = SURVIVORS.length;
  let count = '001';
  let label = 'one lead';
  if (frame >= BAR) {
    const n = Math.round(interpolate(frame, [BAR, BAR * 1.75], [1, 300], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    count = String(n).padStart(3, '0');
    label = 'three hundred';
  }
  if (frame >= BAR * 2) {
    const n = Math.round(interpolate(frame, [BAR * 2, BAR * 2.85], [300, survivors], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
    count = String(n).padStart(3, '0');
    label = 'mostly dead';
  }
  if (frame >= BAR * 3) {
    label = 'answering';
    count = String(survivors).padStart(3, '0');
  }
  const index = `0${Math.min(4, Math.floor(frame / BAR) + 1)} / ${total}`;
  return <Hud index={index} label={label} count={count} />;
};

/** Bar 9: a week of drops, each day a column of dots stacking up. */
export const Week: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = width / 2560;
  const heights = [5, 8, 4, 9, 6, 3, 7];
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const pitch = 64 * u;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: pitch * 1.6, alignItems: 'flex-end', marginTop: 120 * u }}>
        {heights.map((h, d) => (
          <div key={d} style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: pitch - 28 * u }}>
            <div style={{ fontFamily: type.mono, fontSize: 24 * u, color: ink.dim, marginTop: 24 * u }}>{days[d]}</div>
            {Array.from({ length: h }, (_, k) => {
              const t = d * (BEAT / 2) + k * 2;
              const on = frame >= t;
              return <div key={k} style={{ width: 28 * u, height: 28 * u, borderRadius: 999, background: on ? ink.signal : ink.faint, boxShadow: on ? `0 0 ${16 * u}px ${ink.signalGlow}` : undefined }} />;
            })}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: height * 0.2, fontFamily: type.dots, fontWeight: 900, fontSize: 120 * u, color: ink.white, letterSpacing: '0.04em' }}>
        every morning
      </div>
    </AbsoluteFill>
  );
};

/** Bars 10 and 11: the dot comes back alone, the magnet pulls it in, the name. */
export const Ending: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = width / 2560;
  const snap = at(1);
  const ease = Easing.bezier(0.7, 0, 0.84, 0);
  const out = Easing.bezier(0.16, 1, 0.3, 1);
  // The magnet draws itself over the last beat, then the dot is pulled up into it on the downbeat.
  const arch = interpolate(frame, [at(0, 2), at(0, 3.6)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out });
  const poles = interpolate(frame, [at(0, 3), at(0, 3.8)], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out });
  const pull = interpolate(frame, [snap - 14, snap], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const mark = 220 * u;
  const name = interpolate(frame, [snap + 30, snap + 56], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out });
  const url = interpolate(frame, [snap + 60, snap + 86], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out });
  const blink = frame < at(0, 2) ? interpolate(frame % BEAT, [0, 3, BEAT * 0.6, BEAT], [0.35, 1, 1, 0.35]) : 1;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      {pull < 1 && (
        <div
          style={{
            position: 'absolute',
            left: width / 2 - 12 * u,
            top: height / 2 - 12 * u - pull * mark * 0.18,
            width: 24 * u,
            height: 24 * u,
            borderRadius: 999,
            background: ink.white,
            opacity: blink * (arch > 0 ? 1 - pull : 1),
          }}
        />
      )}
      {arch > 0 && (
        <div style={{ opacity: Math.min(1, arch * 3), transform: `translateX(${-name * 230 * u}px)` }}>
          <LogoMark size={mark} arch={arch} poles={poles} lead={pull} glow={pull} />
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: width / 2 - 230 * u + mark / 2 + 50 * u,
          top: height / 2,
          transform: 'translateY(-50%)',
          fontFamily: type.dots,
          fontWeight: 900,
          fontSize: 200 * u,
          color: ink.white,
          opacity: name,
          letterSpacing: '0.02em',
        }}
      >
        nvoke
      </div>
      <div style={{ position: 'absolute', top: height / 2 + 200 * u, fontFamily: type.mono, fontSize: 30 * u, letterSpacing: '0.2em', color: ink.dim, opacity: url }}>
        NVOKE.RUN
      </div>
    </AbsoluteFill>
  );
};

/** The verify shot runs the take this much faster, so the Valid screen counts up within the bar. */
export const COUNT_RATE = 3;

export const Teaser: React.FC<TeaserProps> = ({ takes, voice }) => {
  const have = files();
  const journey = takes.journey.take;
  const counters = journey.rects['counters'];
  const keys = journey.events.filter((e) => e.type === 'key');
  const firstKey = keys[0]?.t ?? markTime(journey, 'paste') + 600;
  const typeFrom = firstKey - 450;
  const typeLength = BAR;
  // The keys of the typing shot, as frames of the film.
  const keyFrames = keys.filter((e) => e.t >= typeFrom && e.t < typeFrom + (typeLength / 60) * 1000).map((e) => at(4) + Math.round(msToFrames(e.t - typeFrom)));
  const v = (line: string) => `teaser/voice/${voice}/${line}.wav`;

  return (
    <TakesContext.Provider value={takes}>
      <AbsoluteFill style={{ background: ink.black }}>
        {shot(0, at(4), <DotField />, 'Dots')}
        {shot(0, at(4), <DotsHud />, 'Dots HUD')}
        {shot(
          at(4),
          BAR,
          <>
            <Macro duration={BAR} startFrom={typeFrom} focus={{ x: 1250, y: 668 }} zoom={[1.75, 2.05]} drift={{ x: 300, y: 0 }} />
            <Hud index="05 / 12" label="paste your site" />
          </>,
          'Typing',
        )}
        {shot(
          at(5),
          BAR,
          <>
            {/* The black stat screens while the search runs: Emails found, then Valid emails counting up in the dot matrix. */}
            <Macro
              duration={BAR}
              startFrom={markTime(journey, 'first-row') + 3000}
              playbackRate={COUNT_RATE}
              focus={{ x: counters ? counters.x + counters.w * 0.76 : 1750, y: counters ? counters.y + counters.h / 2 : 846 }}
              zoom={[2.0, 2.2]}
              drift={{ x: 200, y: 0 }}
              tilt={6}
              band={0.3}
            />
            <Hud index="06 / 12" label="asks the mail server" />
          </>,
          'Verify',
        )}
        {shot(
          at(6),
          BAR,
          <>
            <Macro duration={BAR} startFrom={markTime(journey, 'openers') + 300} focus={{ x: 420, y: 752 }} zoom={[2.1, 2.35]} drift={{ x: 360, y: 0 }} tilt={6} band={0.16} />
            <Hud index="07 / 12" label="writes the first line" />
          </>,
          'Opener',
        )}
        {shot(at(7), BAR, <><DotWords text="WE FIND." /><Hud index="08 / 12" label="nvoke" /></>, 'We find')}
        {shot(at(8), BAR, <><DotWords text="YOU SEND." color={ink.signal} /><Hud index="09 / 12" label="you" /></>, 'You send')}
        {shot(at(9), BAR, <><Week /><Hud index="10 / 12" label="drops, daily" /></>, 'Week')}
        {shot(at(10), TEASER_DURATION - at(10), <Ending />, 'Ending')}
      </AbsoluteFill>

      {/* Sound. The beat runs under everything; the rest sits on its grid. */}
      <Sfx have={have} src="teaser/beat.wav" from={0} volume={0.8} />
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
      {[...'WE FIND.'].map((ch, i) => (ch === ' ' ? null : <Sfx key={`w${i}`} have={have} src="teaser/sfx/tick.wav" from={at(7) + Math.round((i * BEAT) / 4)} volume={0.9} />))}
      {[...'YOU SEND.'].map((ch, i) => (ch === ' ' ? null : <Sfx key={`y${i}`} have={have} src="teaser/sfx/tick.wav" from={at(8) + Math.round((i * BEAT) / 4)} volume={0.9} />))}
      <Sfx have={have} src="teaser/sfx/magnet.wav" from={at(11) - 26} volume={1} />

      {/* The voice. */}
      <Sfx have={have} src={v('l01')} from={at(0, 1)} />
      <Sfx have={have} src={v('l02')} from={at(1, 1)} />
      <Sfx have={have} src={v('l03')} from={at(2, 1)} />
      <Sfx have={have} src={v('l04')} from={at(3, 0.5)} />
      <Sfx have={have} src={v('l05')} from={at(4, 2)} />
      <Sfx have={have} src={v('l06')} from={at(5, 1)} />
      <Sfx have={have} src={v('l07')} from={at(6, 1)} />
      <Sfx have={have} src={v('l08')} from={at(8, 1)} />
      <Sfx have={have} src={v('l09')} from={at(11, 1)} />
    </TakesContext.Provider>
  );
};
