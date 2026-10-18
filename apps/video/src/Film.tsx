import type React from 'react';
import { AbsoluteFill, Easing, Sequence, interpolate, useCurrentFrame } from 'remotion';
import { Backdrop } from './components/Backdrop';
import { EndCard } from './components/EndCard';
import { ColdOpen } from './scenes/ColdOpen';
import { Montage } from './scenes/Montage';
import { PullBack } from './scenes/PullBack';
import { Export, Opener, Paste, Results, Start } from './scenes/Story';
import { TakesContext, type Takes } from './takes';
import { AURA_KEYS, SCENES, type Scene } from './timeline';

export interface FilmProps extends Record<string, unknown> {
  takes: Takes;
}

const smooth = Easing.bezier(0.45, 0, 0.55, 1);

/** The aura's strength at a frame, eased between AURA_KEYS. */
function auraAt(frame: number) {
  return interpolate(
    frame,
    AURA_KEYS.map(([f]) => f),
    AURA_KEYS.map(([, v]) => v),
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: smooth },
  );
}

const at = (s: Scene, children: React.ReactNode, name: string) => (
  <Sequence from={s.from} durationInFrames={s.duration} name={name} premountFor={30}>
    {children}
  </Sequence>
);

/**
 * The launch film. One backdrop under everything so the aura flows across
 * cuts; scenes are placed from the SCENES table in timeline.ts.
 */
export const Film: React.FC<FilmProps> = ({ takes }) => {
  const frame = useCurrentFrame();
  // The aura gathers just below center behind the window, and rises to the middle for the end card.
  const focusY = interpolate(frame, [SCENES.pullBack.from, SCENES.end.from + 30], [0.62, 0.5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: smooth,
  });
  const coldY = interpolate(frame, [0, SCENES.coldOpen.duration], [0.7, 0.62], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: smooth,
  });
  const y = frame < SCENES.coldOpen.duration ? coldY : focusY;
  // The lights gather into one calm glow behind the end card.
  const spread = interpolate(frame, [SCENES.pullBack.from, SCENES.end.from + 60], [1, 0.3], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: smooth,
  });

  return (
    <TakesContext.Provider value={takes}>
      <AbsoluteFill>
        <Backdrop intensity={auraAt(frame)} focus={{ x: 0.5, y }} spread={spread}>
          {at(SCENES.coldOpen, <ColdOpen />, 'Cold open')}
          {at(SCENES.paste, <Paste />, 'Paste your site')}
          {at(SCENES.start, <Start />, 'Start a search')}
          {at(SCENES.results, <Results />, 'Results')}
          {at(SCENES.opener, <Opener />, 'Opener')}
          {at(SCENES.export, <Export />, 'Export')}
          {at(SCENES.montage, <Montage />, 'Montage')}
          {at(SCENES.pullBack, <PullBack />, 'Pull back')}
          {at(SCENES.end, <EndCard />, 'End card')}
        </Backdrop>
      </AbsoluteFill>
    </TakesContext.Provider>
  );
};
