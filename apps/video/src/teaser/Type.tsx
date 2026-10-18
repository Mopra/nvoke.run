import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEAT } from './timing';
import { ink, type } from './look';

/** Dot matrix words, one glyph per sixteenth, like a display being written. */
export const DotWords: React.FC<{ text: string; size?: number; color?: string; startAt?: number; y?: number }> = ({
  text,
  size = 260,
  color = ink.white,
  startAt = 0,
  y,
}) => {
  const frame = useCurrentFrame() - startAt;
  const { width, height } = useVideoConfig();
  const unit = width / 2560;
  const step = BEAT / 4;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        width,
        top: y ?? height / 2,
        transform: 'translateY(-50%)',
        textAlign: 'center',
        fontFamily: type.dots,
        fontWeight: 900,
        fontSize: size * unit,
        letterSpacing: '0.02em',
        lineHeight: 1,
        color,
        whiteSpace: 'pre',
      }}
    >
      {[...text].map((ch, i) => {
        const on = frame >= i * step;
        // A glyph flickers once as it lands, like a matrix cell settling.
        const flick = on && frame < i * step + 3 ? 0.4 : 1;
        return (
          <span key={i} style={{ opacity: on ? flick : 0 }}>
            {ch}
          </span>
        );
      })}
    </div>
  );
};

/** The technical labels in the corners, Nothing style. */
export const Hud: React.FC<{ index: string; label: string; count?: string }> = ({ index, label, count }) => {
  const { width, height } = useVideoConfig();
  const u = width / 2560;
  const m = 64 * u;
  const small: React.CSSProperties = { position: 'absolute', fontFamily: type.mono, fontSize: 22 * u, letterSpacing: '0.14em', color: ink.dim, textTransform: 'uppercase' };
  return (
    <AbsoluteFill>
      <div style={{ ...small, left: m, top: m, fontFamily: type.dots, fontWeight: 900, fontSize: 34 * u, color: ink.white, letterSpacing: '0.04em' }}>nvoke</div>
      <div style={{ ...small, right: m, top: m + 6 * u }}>{index}</div>
      <div style={{ ...small, left: m, bottom: m }}>{label}</div>
      {count !== undefined && (
        <div style={{ ...small, right: m, bottom: m - 6 * u, fontFamily: type.dots, fontWeight: 900, fontSize: 44 * u, color: ink.white }}>{count}</div>
      )}
      {/* Registration marks. */}
      {[
        [m, height / 2],
        [width - m, height / 2],
      ].map(([x, yy], i) => (
        <div key={i} style={{ position: 'absolute', left: x! - 9 * u, top: yy! - 9 * u, width: 18 * u, height: 18 * u }}>
          <div style={{ position: 'absolute', left: 8 * u, top: 0, width: 2 * u, height: 18 * u, background: ink.dim }} />
          <div style={{ position: 'absolute', top: 8 * u, left: 0, height: 2 * u, width: 18 * u, background: ink.dim }} />
        </div>
      ))}
    </AbsoluteFill>
  );
};
