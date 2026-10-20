import type React from 'react';
import { AbsoluteFill, Easing, OffthreadVideo, interpolate, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { msToFrames } from '../timeline';
import { TAKE_HEIGHT, TAKE_RADIUS, TAKE_WIDTH } from '../takes';

/*
 * The hero: the whole panel at last, after three bars of macro. The window
 * is a slab with a body behind its screen, turning slowly in the dark like a
 * product shot on a black sweep: a rim of light runs across its face, it
 * casts a soft pool of shadow and a faint reflection on the floor.
 */

export interface HeroProps {
  src: string;
  /** Ms into the take the shot opens on. */
  startFrom: number;
  duration: number;
}

const orbit = Easing.bezier(0.3, 0, 0.15, 1);

export const Hero: React.FC<HeroProps> = ({ src, startFrom, duration }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const p = interpolate(frame, [0, duration], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: orbit });
  // The slab fills about three quarters of the frame's width.
  const fit = (Math.min(width * (width > height ? 0.7 : 0.92), height * 0.7 * (TAKE_WIDTH / TAKE_HEIGHT)) / TAKE_WIDTH);
  const ry = interpolate(p, [0, 1], [-30, -12]);
  const rx = interpolate(p, [0, 1], [9, 4]);
  const rz = 0;
  const push = interpolate(p, [0, 1], [0.9, 1]);
  const lift = interpolate(frame, [0, 14], [40, 0], { extrapolateRight: 'clamp', easing: Easing.bezier(0.16, 1, 0.3, 1) });
  const fade = interpolate(frame, [0, 8], [0, 1], { extrapolateRight: 'clamp' });
  // The rim light crosses the face once over the shot.
  const sweep = interpolate(frame, [4, duration * 0.85], [-40, 140], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.bezier(0.4, 0, 0.3, 1) });
  const depth = 46;
  const trim = Math.round(msToFrames(startFrom));

  const screen = (
    <OffthreadVideo src={staticFile(src)} trimBefore={trim} muted style={{ width: TAKE_WIDTH, height: TAKE_HEIGHT, display: 'block', borderRadius: TAKE_RADIUS }} />
  );

  const slab = (mirror: boolean) => (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: TAKE_WIDTH,
        height: TAKE_HEIGHT,
        transformStyle: 'preserve-3d',
        transformOrigin: '50% 50%',
        transform: `translate(${width / 2 - TAKE_WIDTH / 2}px, ${height / 2 - TAKE_HEIGHT / 2 + lift}px) scale(${fit * push}) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)${mirror ? ` translateY(${TAKE_HEIGHT + 60}px) scaleY(-1)` : ''}`,
      }}
    >
      {/* The body: a darker block behind the screen, so the turn shows an edge. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: TAKE_RADIUS * 1.5,
          background: 'linear-gradient(90deg, oklch(0.16 0.004 100), oklch(0.24 0.004 100) 30%, oklch(0.12 0.004 100))',
          transform: `translateZ(${-depth}px)`,
        }}
      />
      {/* The right side of the body, catching the light. */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: TAKE_RADIUS,
          width: depth,
          height: TAKE_HEIGHT - TAKE_RADIUS * 2,
          transformOrigin: '100% 50%',
          transform: 'rotateY(90deg)',
          background: 'linear-gradient(180deg, oklch(0.34 0.004 100), oklch(0.18 0.004 100))',
        }}
      />
      {/* The top edge. */}
      <div
        style={{
          position: 'absolute',
          left: TAKE_RADIUS,
          top: 0,
          width: TAKE_WIDTH - TAKE_RADIUS * 2,
          height: depth,
          transformOrigin: '50% 0',
          transform: 'rotateX(-90deg)',
          background: 'linear-gradient(90deg, oklch(0.2 0.004 100), oklch(0.42 0.004 100) 60%, oklch(0.22 0.004 100))',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, borderRadius: TAKE_RADIUS, overflow: 'hidden', boxShadow: 'inset 0 0 0 2px oklch(1 0 0 / 0.08)' }}>
        {screen}
        {/* Glass: a rim of light crossing, and a faint sheen from the top. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            mixBlendMode: 'screen',
            background: `linear-gradient(105deg, transparent ${sweep - 18}%, oklch(1 0 0 / 0.1) ${sweep - 4}%, oklch(1 0 0 / 0.22) ${sweep}%, oklch(1 0 0 / 0.1) ${sweep + 4}%, transparent ${sweep + 18}%)`,
          }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, oklch(1 0 0 / 0.05), transparent 30%)' }} />
      </div>
    </div>
  );

  const floor = height / 2 + (TAKE_HEIGHT / 2) * fit * push * 0.95;

  return (
    <AbsoluteFill style={{ background: 'black', opacity: fade }}>
      {/* The black sweep, lit from above: never a flat black. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 30%, oklch(0.2 0.004 100 / 0.9), transparent 70%)' }} />
      {/* The pool of shadow on the floor. */}
      <div
        style={{
          position: 'absolute',
          left: width * 0.18,
          width: width * 0.64,
          top: floor - height * 0.03,
          height: height * 0.08,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, oklch(0 0 0 / 0.9), transparent 70%)',
          filter: `blur(${height * 0.02}px)`,
        }}
      />
      <AbsoluteFill style={{ perspective: 2200, opacity: 0.12, maskImage: `linear-gradient(to bottom, transparent ${(floor / height) * 100}%, black ${(floor / height) * 100 + 2}%, transparent ${(floor / height) * 100 + 18}%)`, WebkitMaskImage: `linear-gradient(to bottom, transparent ${(floor / height) * 100}%, black ${(floor / height) * 100 + 2}%, transparent ${(floor / height) * 100 + 18}%)`, filter: 'blur(6px)' }}>
        {slab(true)}
      </AbsoluteFill>
      <AbsoluteFill style={{ perspective: 2200 }}>{slab(false)}</AbsoluteFill>
    </AbsoluteFill>
  );
};
