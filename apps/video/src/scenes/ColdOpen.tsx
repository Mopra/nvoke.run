import type React from 'react';
import { AbsoluteFill, Freeze, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Caption } from '../components/Caption';
import { useStage } from '../layout';
import { SCENES, sec } from '../timeline';

/** When the window starts to rise, local frames. The second caption arrives with it. */
const WINDOW_IN = sec(4.95);
const FIRST_LINE_OUT = sec(4.55);

/**
 * 0:00 to 0:09. A bare canvas; the aura blooms (Film drives it). The first
 * line says the premise alone in the middle of the frame. Then the window
 * floats up out of a soft blur into its resting place and the second line
 * lands above it. The window holds the first frame of `paste-site`, so the
 * next scene starts playing it with no visible cut.
 */
export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stage = useStage();
  const u = stage.unit;

  // A long, overdamped rise: no overshoot, all settle.
  const rise = spring({ frame: frame - WINDOW_IN, fps, config: { damping: 200, stiffness: 38, mass: 1.4 } });
  const appear = interpolate(frame, [WINDOW_IN, WINDOW_IN + 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const box = stage.window;
  const travel = 220 * u;
  const scale = 0.93 + rise * 0.07;

  return (
    <AbsoluteFill>
      <Sequence durationInFrames={FIRST_LINE_OUT} layout="none">
        <Caption
          text="Every sale starts with a name."
          duration={FIRST_LINE_OUT}
          enterAt={sec(0.75)}
          size={120}
          y={stage.height * 0.49}
          stagger={6}
          exit={30}
        />
      </Sequence>
      {frame >= WINDOW_IN && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: appear,
            transform: `translateY(${(1 - rise) * travel}px) scale(${scale})`,
            transformOrigin: `${box.x + box.w / 2}px ${box.y + box.h / 2}px`,
            filter: rise < 0.97 ? `blur(${(1 - rise) * 10 * u}px)` : undefined,
          }}
        >
          <Freeze frame={0}>
            <AppWindow take="paste-site" box={box} cursor={false} lift={0.4 + rise * 0.6} />
          </Freeze>
        </div>
      )}
      <Sequence from={WINDOW_IN + 10} layout="none">
        <Caption text="nvoke finds them. Live." accent={['Live.']} duration={SCENES.coldOpen.duration - WINDOW_IN - 10} size={96} />
      </Sequence>
    </AbsoluteFill>
  );
};
