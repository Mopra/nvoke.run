import type React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { AppWindow } from '../components/AppWindow';
import { Camera } from '../components/Camera';
import { Caption } from '../components/Caption';
import { useStage } from '../layout';
import { useTake } from '../takes';
import { SCENES, sec } from '../timeline';
import { EASE_IN_OUT } from '../theme';

const easeInOut = Easing.bezier(...EASE_IN_OUT);
const OFFER_IN = sec(1.7);

/**
 * 0:60 to 0:66. The camera pulls back, the window recedes into the canvas as
 * the aura settles, and the offer stands alone in the middle of the frame.
 */
export const PullBack: React.FC = () => {
  const frame = useCurrentFrame();
  const stage = useStage();
  const state = useTake('ongoing');
  const fade = interpolate(frame, [sec(0.6), sec(2.2)], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeInOut,
  });
  const blur = (1 - fade) * 14 * stage.unit;
  return (
    <AbsoluteFill>
      {fade > 0 && (
        <AbsoluteFill style={{ opacity: fade, filter: blur > 0.1 ? `blur(${blur}px)` : undefined }}>
          <Camera box={stage.window} take={state.take} keys={[{ at: 0, dur: sec(2.4), zoom: 0.72 }]}>
            <AppWindow take="ongoing" box={stage.window} startFrom={4000} cursor={false} />
          </Camera>
        </AbsoluteFill>
      )}
      <Sequence from={OFFER_IN} layout="none">
        <Caption
          text="Start free."
          sub="50 verified emails a month."
          accent={['free.']}
          duration={SCENES.pullBack.duration - OFFER_IN}
          size={120}
          y={stage.height * 0.48}
          stagger={6}
          exit={26}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
