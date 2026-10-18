import type React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { fonts } from '../fonts';
import { useStage } from '../layout';
import { EASE_IN, EASE_OUT, theme } from '../theme';

export interface CaptionProps {
  text: string;
  /** Optional muted second line, smaller, revealed after the first. */
  sub?: string;
  /** Frames this caption is on screen (local). The exit plays at the end of it. */
  duration: number;
  /** Local frame the first word starts. */
  enterAt?: number;
  /** Display size in px on the 1440p master; scaled for other formats. 72 to 120. */
  size?: number;
  /** Vertical center in px. Defaults to the caption band above the window. */
  y?: number;
  /** Words (as written, punctuation included) painted in iris. Spend it sparingly. */
  accent?: string[];
  /** Frames between words. */
  stagger?: number;
  /** Frames the exit takes. 0 holds the caption to the end with no exit. */
  exit?: number;
  align?: 'center' | 'left';
  /** Horizontal anchor for left aligned captions, px. */
  x?: number;
  style?: React.CSSProperties;
}

const REVEAL = 42;
const easeOut = Easing.bezier(...EASE_OUT);
const easeIn = Easing.bezier(...EASE_IN);

function Word({
  word,
  start,
  exitStart,
  exit,
  accent,
  unit,
}: {
  word: string;
  start: number;
  exitStart: number;
  exit: number;
  accent: boolean;
  unit: number;
}) {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [start, start + REVEAL], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easeOut,
  });
  const q = exit
    ? interpolate(frame, [exitStart, exitStart + exit], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: easeIn,
      })
    : 0;
  const opacity = Math.min(p, 1 - q);
  const blur = (1 - p) * 16 * unit + q * 12 * unit;
  const y = (1 - p) * 0.32 - q * 0.12;
  const accentStyle: React.CSSProperties = accent
    ? {
        backgroundImage: `linear-gradient(100deg, ${theme.primary} 10%, oklch(0.6 0.2 285) 90%)`,
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
      }
    : {};
  return (
    <span
      style={{
        display: 'inline-block',
        opacity,
        transform: `translateY(${y}em)`,
        filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
        // Room for descenders and the blur, so the gradient clip never cuts a glyph.
        padding: '0.08em 0.02em 0.12em',
        margin: '-0.08em -0.02em -0.12em',
        ...accentStyle,
      }}
    >
      {word}
    </span>
  );
}

/**
 * Keynote type: big, tight, calm. Each word rises out of a blur in turn, the
 * whole line leaves together with a short lift. Text is the foreground token,
 * the optional second line is muted.
 */
export const Caption: React.FC<CaptionProps> = ({
  text,
  sub,
  duration,
  enterAt = 0,
  size = 96,
  y,
  accent = [],
  stagger = 4,
  exit = 22,
  align = 'center',
  x,
  style,
}) => {
  const stage = useStage();
  const unit = stage.unit;
  const px = size * unit;
  const words = text.split(' ');
  const subWords = sub ? sub.split(' ') : [];
  const exitStart = duration - exit;
  const subStart = enterAt + words.length * stagger + 10;
  const centerY = y ?? stage.captionY;

  const lineStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: align === 'center' ? 'center' : 'flex-start',
    columnGap: '0.24em',
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: align === 'center' ? (stage.width - stage.captionWidth) / 2 : (x ?? stage.width * 0.08),
        width: stage.captionWidth,
        top: centerY,
        transform: 'translateY(-50%)',
        textAlign: align,
        fontFamily: fonts.display,
        color: theme.foreground,
        ...style,
      }}
    >
      <div
        style={{
          ...lineStyle,
          fontSize: px,
          fontWeight: 600,
          letterSpacing: '-0.038em',
          lineHeight: 1.04,
        }}
      >
        {words.map((w, i) => (
          <Word
            key={i}
            word={w}
            start={enterAt + i * stagger}
            exitStart={exitStart + i * 1.5}
            exit={exit}
            accent={accent.includes(w)}
            unit={unit}
          />
        ))}
      </div>
      {sub && (
        <div
          style={{
            ...lineStyle,
            marginTop: px * 0.34,
            fontSize: px * 0.4,
            fontWeight: 500,
            letterSpacing: '-0.018em',
            lineHeight: 1.2,
            color: theme.mutedForeground,
          }}
        >
          {subWords.map((w, i) => (
            <Word
              key={i}
              word={w}
              start={subStart + i * 2}
              exitStart={exitStart}
              exit={exit}
              accent={accent.includes(w)}
              unit={unit}
            />
          ))}
        </div>
      )}
    </div>
  );
};
