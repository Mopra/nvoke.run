import type React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { msToFrames } from '../timeline';
import { TAKE_HEIGHT, TAKE_WIDTH } from '../takes';

/*
 * The studio macro: a real camera a few centimeters from the screen. The
 * take lies on a plane in 3D; the camera yaws and pushes across it, so the
 * near side grows and the far side falls away. Depth of field is three
 * layers (far blur, near blur, the sharp band on the focal line), the focus
 * racks in from soft at the cut, and a bloom layer lets the bright pixels
 * (the orange, the white digits) glow like they do through glass.
 */

export interface LensProps {
  /** The take file in public/takes. */
  src: string;
  /** Ms into the take the shot opens on. */
  startFrom: number;
  playbackRate?: number;
  /** The point in the take (2400x1350 px) the lens sits on. */
  focus: { x: number; y: number };
  /** Take pixels per frame pixel at the start of the shot, and at the end (the push). */
  zoom: [number, number];
  /** Drift of the focus point over the shot, take px. */
  drift?: { x: number; y: number };
  /** Degrees the screen leans back. */
  pitch?: number;
  /** Degrees the camera yaws across the shot, start and end. */
  yaw?: [number, number];
  /** Height of the sharp band as a share of the frame. */
  band?: number;
  duration: number;
}

const glide = Easing.bezier(0.45, 0, 0.2, 1);
const rack = Easing.bezier(0.2, 0.9, 0.3, 1);

export const Lens: React.FC<LensProps> = ({
  src,
  startFrom,
  playbackRate = 1,
  focus,
  zoom,
  drift = { x: 0, y: 0 },
  pitch = 14,
  yaw = [-7, -2],
  band = 0.2,
  duration,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  // Sized by the long side, so the vertical cut keeps the same lens.
  const u = Math.max(width, height) / 2560;
  const p = interpolate(frame, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: glide });
  const z = zoom[0] + (zoom[1] - zoom[0]) * p;
  const fx = focus.x + drift.x * p;
  const fy = focus.y + drift.y * p;
  const ry = yaw[0] + (yaw[1] - yaw[0]) * p;
  // The focus racks in over the first 18 frames: soft, past sharp, settled.
  const soft = interpolate(frame, [0, 18], [16, 0], { extrapolateRight: 'clamp', easing: rack }) * u;
  // The focal band rides up into place as the focus pulls.
  const bandShift = interpolate(frame, [0, 18], [8, 0], { extrapolateRight: 'clamp', easing: rack });
  const exposure = interpolate(frame, [0, 6], [0.35, 1], { extrapolateRight: 'clamp' });

  const plane = (key: string, style: React.CSSProperties) => (
    <AbsoluteFill key={key} style={{ perspective: 1500 * u, perspectiveOrigin: '50% 40%', ...style }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: TAKE_WIDTH,
          height: TAKE_HEIGHT,
          transformOrigin: '0 0',
          transform: `translate(${width / 2}px, ${height / 2}px) rotateX(${pitch}deg) rotateY(${ry}deg) scale(${z * u}) translate(${-fx}px, ${-fy}px)`,
        }}
      >
        <OffthreadVideo
          src={staticFile(src)}
          trimBefore={Math.round(msToFrames(startFrom))}
          playbackRate={playbackRate}
          muted
          style={{ width: TAKE_WIDTH, height: TAKE_HEIGHT, display: 'block' }}
        />
      </div>
    </AbsoluteFill>
  );

  const h = band * 100;
  const mid = 50 + bandShift;
  const sharp = `linear-gradient(to bottom, transparent ${mid - h}%, black ${mid - h / 3}%, black ${mid + h / 3}%, transparent ${mid + h}%)`;
  const near = `linear-gradient(to bottom, transparent ${mid - h * 2.2}%, black ${mid - h}%, black ${mid + h}%, transparent ${mid + h * 2.4}%)`;

  return (
    <AbsoluteFill style={{ background: 'black', opacity: exposure }}>
      {plane('far', { filter: `blur(${14 * u + soft}px) brightness(0.8)` })}
      {plane('near', { filter: `blur(${5 * u + soft}px)`, maskImage: near, WebkitMaskImage: near })}
      {plane('sharp', { filter: soft > 0.2 ? `blur(${soft}px)` : undefined, maskImage: sharp, WebkitMaskImage: sharp })}
      {/* Bloom: the bright pixels, blurred wide and added back. */}
      {plane('bloom', { filter: `brightness(0.9) contrast(2.6) blur(${26 * u}px)`, mixBlendMode: 'screen', opacity: 0.32 })}
      {/* Light falloff of a fast lens, soft, never a hard oval. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 95% 85% at 50% 48%, transparent 45%, oklch(0 0 0 / 0.5) 80%, oklch(0 0 0 / 0.85) 100%)' }} />
    </AbsoluteFill>
  );
};
