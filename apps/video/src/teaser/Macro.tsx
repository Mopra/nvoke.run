import type React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { msToFrames } from '../timeline';
import { TAKE_HEIGHT, TAKE_WIDTH } from '../takes';

/*
 * A macro shot of the real app: the take pushed in close, tilted a few
 * degrees, with a shallow focus band so only one line is sharp, falling off
 * into black. Like a lens a few centimeters from a screen.
 */

export interface MacroProps {
  /** Ms into the journey take the shot opens on. */
  startFrom: number;
  playbackRate?: number;
  /** The point in the take (2400x1350 px) the lens sits on. */
  focus: { x: number; y: number };
  /** Take pixels per frame pixel at the start of the shot, and at the end (a slow push). */
  zoom: [number, number];
  /** Drift of the focus point over the shot, take px. */
  drift?: { x: number; y: number };
  /** Degrees of tilt: the far edge of the screen leans away. */
  tilt?: number;
  /** Height of the sharp band as a share of the frame. */
  band?: number;
  duration: number;
}

const ease = Easing.bezier(0.33, 0, 0.67, 1);

export const Macro: React.FC<MacroProps> = ({ startFrom, playbackRate = 1, focus, zoom, drift = { x: 0, y: 0 }, tilt = 7, band = 0.22, duration }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = interpolate(frame, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease });
  const z = zoom[0] + (zoom[1] - zoom[0]) * p;
  const fx = focus.x + drift.x * p;
  const fy = focus.y + drift.y * p;
  // Fades in from black over a few frames: the lens finding focus.
  const focusIn = interpolate(frame, [0, 10], [14, 0], { extrapolateRight: 'clamp' });

  const layer = (blur: number, mask?: string): React.ReactNode => (
    <AbsoluteFill
      style={{
        perspective: 1600,
        filter: blur + focusIn > 0.2 ? `blur(${blur + focusIn}px)` : undefined,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: TAKE_WIDTH,
          height: TAKE_HEIGHT,
          transformOrigin: '0 0',
          transform: `translate(${width / 2}px, ${height / 2}px) rotateX(${tilt}deg) rotateZ(${-tilt * 0.25}deg) scale(${z}) translate(${-fx}px, ${-fy}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile('takes/journey.mp4')}
          trimBefore={Math.round(msToFrames(startFrom))}
          playbackRate={playbackRate}
          muted
          style={{ width: TAKE_WIDTH, height: TAKE_HEIGHT, display: 'block' }}
        />
      </div>
    </AbsoluteFill>
  );

  const h = band * 100;
  const sharp = `linear-gradient(to bottom, transparent ${50 - h}%, black ${50 - h / 3}%, black ${50 + h / 3}%, transparent ${50 + h}%)`;

  return (
    <AbsoluteFill style={{ background: 'black', filter: 'contrast(1.06)' }}>
      {layer(9)}
      {layer(0, sharp)}
      {/* The lens falls off to black at the edges. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 78% 72% at 50% 50%, transparent 58%, oklch(0 0 0 / 0.55) 82%, black 100%)' }} />
    </AbsoluteFill>
  );
};
