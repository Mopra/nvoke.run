import type React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { ink, type } from '../teaser/look';
import { BAR, BEAT } from '../teaser/timing';

/*
 * Dot matrix words, finished: each glyph lands on its sixteenth hot (a white
 * flash and a wide glow that cools in a few frames, like a display cell
 * striking), drops the last few pixels into place, and the whole line keeps
 * moving toward the camera through the bar, so nothing ever sits still.
 */

export const Words: React.FC<{ text: string; size?: number; color?: string; glow?: string }> = ({ text, size = 260, color = ink.white, glow = 'oklch(1 0 0 / 0.5)' }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const u = width / 2560;
  const step = BEAT / 4;
  const push = interpolate(frame, [0, BAR], [1, 1.045], { extrapolateRight: 'clamp', easing: Easing.bezier(0.3, 0, 0.7, 1) });
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div
        style={{
          transform: `scale(${push})`,
          fontFamily: type.dots,
          fontWeight: 900,
          fontSize: size * u,
          letterSpacing: '0.02em',
          lineHeight: 1,
          whiteSpace: 'pre',
          marginTop: -0.04 * height,
        }}
      >
        {[...text].map((ch, i) => {
          const t = frame - i * step;
          if (t < 0) return <span key={i} style={{ opacity: 0 }}>{ch}</span>;
          const heat = interpolate(t, [0, 8], [1, 0], { extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 0.8, 0.4, 1) });
          const drop = interpolate(t, [0, 7], [-10 * u, 0], { extrapolateRight: 'clamp', easing: Easing.bezier(0.2, 1.4, 0.4, 1) });
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                transform: `translateY(${drop}px)`,
                color: heat > 0.5 ? ink.white : color,
                textShadow: `0 0 ${(8 + 50 * heat) * u}px ${glow}, 0 0 ${(2 + 10 * heat) * u}px ${glow}`,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
