import type React from 'react';
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from 'remotion';

/*
 * The film's finish, over everything: grain that moves every frame, a soft
 * lens falloff, and on the glitch hits a few frames where the picture tears
 * into its red and blue and jumps sideways, in sync with the sound.
 */

export interface FinishProps {
  children: React.ReactNode;
  /** Frames where a glitch hit lands; each tears the picture for GLITCH frames. */
  glitches?: number[];
}

const GLITCH = 5;

export const Finish: React.FC<FinishProps> = ({ children, glitches = [] }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = Math.max(width, height) / 2560;
  const hit = glitches.find((g) => frame >= g && frame < g + GLITCH);
  const k = hit === undefined ? 0 : 1 - (frame - hit) / GLITCH;
  const split = k * 14 * u;
  const jump = hit === undefined ? 0 : (random(`jump-${frame}`) - 0.5) * 40 * u * k;

  return (
    <AbsoluteFill style={{ background: 'black' }}>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <defs>
          <filter id="tear" x="-5%" y="0" width="110%" height="100%" colorInterpolationFilters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r" />
            <feOffset in="r" dx={split} dy={0} result="r2" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g" />
            <feColorMatrix in="SourceGraphic" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b" />
            <feOffset in="b" dx={-split} dy={0} result="b2" />
            <feBlend in="r2" in2="g" mode="screen" result="rg" />
            <feBlend in="rg" in2="b2" mode="screen" />
          </filter>
        </defs>
      </svg>
      <AbsoluteFill style={{ filter: k > 0 ? 'url(#tear)' : undefined, transform: jump ? `translateX(${jump}px)` : undefined }}>{children}</AbsoluteFill>
      {/* Grain: a fresh noise field each frame, at half size so the grain reads at 1440p and 720p. */}
      <AbsoluteFill style={{ mixBlendMode: 'overlay', opacity: 0.16, pointerEvents: 'none' }}>
        <svg width={width / 2} height={height / 2} style={{ width, height, display: 'block' }}>
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 97} stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
      </AbsoluteFill>
      {/* The faintest falloff at the corners, the same on every shot. */}
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse 110% 100% at 50% 50%, transparent 62%, oklch(0 0 0 / 0.35) 100%)', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
