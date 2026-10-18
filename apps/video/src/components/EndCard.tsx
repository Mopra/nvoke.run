import type React from 'react';
import { Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { fonts } from '../fonts';
import { useStage } from '../layout';
import { EASE_IN_OUT, EASE_OUT, theme } from '../theme';
import { LogoMark } from './LogoMark';

const easeOut = Easing.bezier(...EASE_OUT);
const easeInOut = Easing.bezier(...EASE_IN_OUT);

const WORD = 'nvoke';
const TRACKING = -0.045;

/** Width of the wordmark at a size, measured with the loaded display font. */
function measure(px: number): number {
  const fallback = px * 0.5 * WORD.length;
  if (typeof document === 'undefined') return fallback;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return fallback;
  ctx.font = `600 ${px}px ${fonts.display}`;
  const w = ctx.measureText(WORD).width;
  return w > 0 ? w + TRACKING * px * WORD.length : fallback;
}

function reveal(frame: number, start: number, length = 40) {
  return interpolate(frame, [start, start + length], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
}

/**
 * The last shot. The mark arrives alone in the center and draws itself (the
 * arch, the poles, then the lead pulled up), the lockup opens to make room for
 * the wordmark, and the address and platforms settle in beneath. Holds still
 * to the final frame.
 */
export const EndCard: React.FC<{ y?: number }> = ({ y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stage = useStage();
  const u = stage.unit;
  const mark = 168 * u;
  const word = 164 * u;
  const gap = mark * 0.3;
  const wordW = measure(word);
  const centerY = y ?? stage.height * 0.47;

  // The mark: in from a soft blur, scaling up on a no overshoot spring.
  const markIn = spring({ frame, fps, config: { damping: 200, stiffness: 70, mass: 1 }, durationInFrames: 50 });
  const arch = interpolate(frame, [8, 46], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const poles = interpolate(frame, [18, 40], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  // The lead's pull may overshoot a hair, like the app's spring.
  const lead = spring({ frame: frame - 24, fps, config: { damping: 14, stiffness: 120, mass: 0.7 } });

  // The lockup opens: the mark slides left as the wordmark arrives.
  const open = interpolate(frame, [44, 92], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeInOut });
  const total = mark + gap + wordW;
  const shift = (1 - open) * (total - mark) * 0.5;
  const wordP = reveal(frame, 54, 46);

  const url = reveal(frame, 92, 44);
  const platforms = reveal(frame, 104, 44);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div
        style={{
          position: 'absolute',
          left: (stage.width - total) / 2,
          top: centerY - mark / 2,
          width: total,
          height: mark,
          display: 'flex',
          alignItems: 'center',
          gap,
          transform: `translateX(${shift}px)`,
        }}
      >
        <div
          style={{
            opacity: markIn,
            transform: `scale(${0.82 + markIn * 0.18})`,
            filter: markIn < 0.98 ? `blur(${(1 - markIn) * 18 * u}px)` : undefined,
          }}
        >
          <LogoMark size={mark} arch={arch} poles={poles} lead={lead} glow={0.4 + markIn * 0.6} />
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 600,
            fontSize: word,
            letterSpacing: `${TRACKING}em`,
            lineHeight: 1,
            color: theme.foreground,
            // Optical alignment: lowercase x-height centered on the mark, not the em box.
            transform: `translate(${(1 - wordP) * -0.18}em, -0.04em)`,
            opacity: wordP,
            filter: wordP < 0.98 ? `blur(${(1 - wordP) * 14 * u}px)` : undefined,
            whiteSpace: 'nowrap',
          }}
        >
          {WORD}
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: centerY + mark / 2 + 110 * u,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: fonts.display,
            fontWeight: 500,
            fontSize: 54 * u,
            letterSpacing: '-0.02em',
            color: theme.foreground,
            opacity: url,
            transform: `translateY(${(1 - url) * 0.35}em)`,
            filter: url < 0.98 ? `blur(${(1 - url) * 10 * u}px)` : undefined,
          }}
        >
          nvoke.run
        </div>
        <div
          style={{
            marginTop: 22 * u,
            fontFamily: fonts.text,
            fontWeight: 500,
            fontSize: 30 * u,
            letterSpacing: '-0.005em',
            color: theme.mutedForeground,
            opacity: platforms,
            transform: `translateY(${(1 - platforms) * 0.4}em)`,
            filter: platforms < 0.98 ? `blur(${(1 - platforms) * 8 * u}px)` : undefined,
          }}
        >
          Mac, Windows, Linux
        </div>
      </div>
    </div>
  );
};
