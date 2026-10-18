import type React from 'react';
import { AbsoluteFill, Audio, Easing, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Backdrop } from '../components/Backdrop';
import { Camera, type CameraKey } from '../components/Camera';
import { Caption, type CaptionProps } from '../components/Caption';
import { LogoMark } from '../components/LogoMark';
import { fonts } from '../fonts';
import { useStage, type Box } from '../layout';
import { markTime, TAKE_HEIGHT, TAKE_WIDTH, TakesContext, useTake, type Takes } from '../takes';
import { Loop } from './Loop';
import { dark } from './palette';
import { BAR, BEAT, bar, LAUNCH_DURATION, MUSIC } from './timing';

/*
 * The launch cut: about 29 seconds, one idea per bar, cut on the beat. Dark
 * stage, the app in light mode inside its window. The story: lead lists go
 * stale; paste your site; nvoke works out who buys, finds them, checks every
 * inbox, writes the first line; then the loop runs every morning; we find,
 * you send.
 */

export interface LaunchProps extends Record<string, unknown> {
  takes: Takes;
}

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** A cut: lands with a small punch in, on the bar. */
const Shot: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const k = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return <AbsoluteFill style={{ opacity: Math.min(1, frame / 3), transform: `scale(${1.035 - 0.035 * k})` }}>{children}</AbsoluteFill>;
};

/** Type on the dark stage. */
const Line: React.FC<Omit<CaptionProps, 'color' | 'subColor'>> = (props) => (
  <Caption color={dark.foreground} subColor={dark.mutedForeground} stagger={3} exit={10} {...props} />
);

/** Fades the window layer in from the left, clear of the line. */
const EDGE = 'linear-gradient(to right, transparent 0%, transparent 33%, black 37%, black 100%)';

/** Where the window sits when a line holds the left of the frame. */
function useSideBox(): Box {
  const stage = useStage();
  if (stage.format !== 'wide') return stage.window;
  const w = stage.width * 0.6;
  const h = (w * TAKE_HEIGHT) / TAKE_WIDTH;
  return { x: stage.width * 0.36, y: (stage.height - h) / 2, w, h };
}

/** The journey take at a mark, a line on the left, the camera on the right. */
const WindowShot: React.FC<{
  mark: string;
  offset?: number;
  rate?: number;
  keys?: CameraKey[];
  line: string;
  sub?: string;
  accent?: string[];
  cursor?: boolean;
}> = ({ mark, offset = 0, rate = 1, keys = [], line, sub, accent, cursor = true }) => {
  const stage = useStage();
  const box = useSideBox();
  const state = useTake('journey');
  const startFrom = Math.max(0, markTime(state.take, mark) + offset);
  const wide = stage.format === 'wide';
  // A push in centers its target in the part of the frame the mask leaves open.
  const open = wide ? { x: stage.width * 0.685, y: stage.height / 2 } : { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const anchored = keys.map((k) => ({ anchor: open, ...k }));
  return (
    <Shot>
      {/* The window lives right of the line: a push in crops at a soft edge rather than running into the type. */}
      <AbsoluteFill style={wide ? { maskImage: EDGE, WebkitMaskImage: EDGE } : undefined}>
        <Camera box={box} take={state.take} keys={anchored}>
          <AppWindow take="journey" box={box} startFrom={startFrom} playbackRate={rate} cursor={cursor} lift={1} />
        </Camera>
      </AbsoluteFill>
      <Line
        text={line}
        sub={sub}
        accent={accent}
        duration={BAR}
        enterAt={2}
        size={wide ? 92 : 84}
        align={wide ? 'left' : 'center'}
        x={stage.width * 0.055}
        width={wide ? stage.width * 0.28 : undefined}
        y={wide ? stage.height / 2 : stage.height * 0.12}
      />
    </Shot>
  );
};

/** A line alone on the stage. */
const Card: React.FC<{ text: string; sub?: string; accent?: string[]; duration?: number; size?: number }> = ({
  text,
  sub,
  accent,
  duration = BAR,
  size = 128,
}) => {
  const stage = useStage();
  return (
    <Shot>
      <Line text={text} sub={sub} accent={accent} duration={duration} enterAt={3} stagger={4} size={size} y={stage.height / 2} />
    </Shot>
  );
};

const LoopShot: React.FC = () => {
  const stage = useStage();
  const wide = stage.format === 'wide';
  const width = wide ? stage.width * 0.54 : stage.width * 0.9;
  return (
    <Shot>
      <AbsoluteFill style={{ alignItems: wide ? 'flex-end' : 'center', justifyContent: 'center', paddingRight: wide ? stage.width * 0.07 : 0 }}>
        <div style={{ marginTop: wide ? 0 : stage.height * 0.2 }}>
          <Loop width={width} lap={Math.round(BAR * 1.0)} dayEvery={Math.round(BEAT / 2)} />
        </div>
      </AbsoluteFill>
      <Line
        text="Then it runs every morning."
        sub="New leads land. Nobody opens the app."
        duration={BAR * 2}
        enterAt={4}
        size={wide ? 96 : 84}
        align={wide ? 'left' : 'center'}
        x={stage.width * 0.055}
        width={wide ? stage.width * 0.32 : undefined}
        y={wide ? stage.height / 2 : stage.height * 0.16}
      />
    </Shot>
  );
};

const End: React.FC = () => {
  const frame = useCurrentFrame();
  const stage = useStage();
  const u = stage.unit;
  const k = (from: number) => interpolate(frame, [from, from + 26], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const mark = k(0);
  const word = k(10);
  const line = k(24);
  const url = k(40);
  return (
    <Shot>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', fontFamily: fonts.display, color: dark.foreground }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 * u }}>
          <div style={{ opacity: mark, transform: `scale(${0.85 + mark * 0.15})` }}>
            <LogoMark size={150 * u} arch={mark} poles={k(8)} lead={k(16)} glow={1} />
          </div>
          <div style={{ fontSize: 168 * u, fontWeight: 600, letterSpacing: '-0.05em', opacity: word, transform: `translateX(${(1 - word) * -20 * u}px)` }}>
            nvoke
          </div>
        </div>
        <div style={{ marginTop: 64 * u, fontSize: 52 * u, fontWeight: 500, letterSpacing: '-0.025em', opacity: line, transform: `translateY(${(1 - line) * 14 * u}px)` }}>
          Find companies. Get emails that actually work.
        </div>
        <div style={{ marginTop: 26 * u, fontFamily: fonts.text, fontSize: 34 * u, color: dark.mutedForeground, opacity: url }}>
          nvoke.run <span style={{ opacity: 0.5, margin: `0 ${12 * u}px` }}>·</span> Free to start
        </div>
      </AbsoluteFill>
    </Shot>
  );
};

/** The aura over the cut: low for the cold open, up with the drop, a calm glow at the end. */
function auraAt(frame: number): number {
  return interpolate(
    frame,
    [0, bar(1), bar(2), bar(3) - 4, bar(3) + 8, bar(7), bar(9), bar(10), LAUNCH_DURATION],
    [0.25, 0.45, 0.7, 0.8, 1.5, 1.2, 1.4, 1.0, 1.1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
}

const at = (from: number, length: number, node: React.ReactNode, name: string) => (
  <Sequence from={from} durationInFrames={length} name={name} premountFor={60}>
    {node}
  </Sequence>
);

export const Launch: React.FC<LaunchProps> = ({ takes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeOut = LAUNCH_DURATION - Math.round(1.6 * fps);
  return (
    <TakesContext.Provider value={takes}>
      <Backdrop base={dark.stage} intensity={auraAt(frame)} focus={{ x: 0.62, y: 0.55 }} spread={1.1}>
        {at(bar(0), BAR, <Card text="Bought a lead list?" />, 'Cold open')}
        {at(bar(1), BAR, <Card text="It went stale before you paid for it." accent={['stale']} size={112} />, 'Stale')}
        {at(
          bar(2),
          BAR,
          <WindowShot mark="paste" offset={-200} rate={1.6} line="Paste your site." sub="That's the setup." keys={[{ at: 0, dur: BAR, rect: 'siteField', fill: 0.5, maxZoom: 1.45 }]} />,
          'Paste',
        )}
        {at(
          bar(3),
          BAR,
          <WindowShot
            mark="suggestions"
            offset={-500}
            rate={1}
            line="nvoke works out who buys from you."
            keys={[{ at: 18, dur: BAR - 18, rect: 'suggestion', fill: 0.62, maxZoom: 1.5 }]}
          />,
          'Plan',
        )}
        {at(
          bar(4),
          BAR,
          <WindowShot
            mark="started"
            offset={-450}
            rate={2.6}
            line="Finds them. Reads their sites."
            keys={[{ at: 30, dur: BAR - 30, rect: 'counters', fill: 0.8 }]}
          />,
          'Find',
        )}
        {at(
          bar(5),
          BAR,
          <WindowShot
            mark="first-row"
            offset={7000}
            rate={8}
            cursor={false}
            line="Asks every mail server if the inbox is real."
            sub="You pay for the ones that are."
            keys={[{ at: 0, dur: 1 }, { at: 1, dur: BAR, rect: 'first-company', fill: 0.92 }]}
          />,
          'Verify',
        )}
        {at(
          bar(6),
          BAR,
          <WindowShot
            mark="openers"
            offset={-700}
            rate={1}
            cursor={false}
            line="Writes the first line from their own site."
            keys={[{ at: 0, dur: BAR, rect: 'first-company', fill: 1, maxZoom: 2 }]}
          />,
          'Opener',
        )}
        {at(bar(7), BAR * 2, <LoopShot />, 'Loop')}
        {at(bar(9), BAR, <Card text="We find. You send." sub="nvoke never sends an email. Not one." size={136} />, 'We find')}
        {at(bar(10), LAUNCH_DURATION - bar(10), <End />, 'End')}
      </Backdrop>
      <Audio
        src={staticFile(MUSIC.file)}
        trimBefore={Math.round(MUSIC.offset * fps)}
        volume={(f) => interpolate(f, [0, 8, fadeOut, LAUNCH_DURATION], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    </TakesContext.Provider>
  );
};
