import type React from 'react';
import { AbsoluteFill, Easing, Img, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';

/** A generated clip (or a still, held), graded into the film: cooler, a touch of contrast, a slow push. */
const look: React.CSSProperties = { width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.8) contrast(1.1) brightness(0.92)' };

export const Real: React.FC<{ src: string; from?: number; rate?: number; push?: [number, number]; length: number }> = ({ src, from = 0, rate = 1, push = [1.02, 1.1], length }) => {
  const frame = useCurrentFrame();
  const s = interpolate(frame, [0, length], push, { extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.6, 1) });
  const fade = interpolate(frame, [0, 4], [0.4, 1], { extrapolateRight: 'clamp' });
  return (
    <AbsoluteFill style={{ background: 'black', opacity: fade }}>
      {src.endsWith('.png') ? (
        <Img src={staticFile(src)} style={{ ...look, transform: `scale(${s})` }} />
      ) : (
        <OffthreadVideo src={staticFile(src)} trimBefore={Math.round(from * 60)} playbackRate={rate} muted style={{ ...look, transform: `scale(${s})` }} />
      )}
    </AbsoluteFill>
  );
};
