import type React from 'react';
import { fonts } from '../fonts';
import { TAKE_HEIGHT, TAKE_WIDTH, type Take } from '../takes';
import { theme } from '../theme';

/** Windows 11 caption glyphs (minimize, maximize, close), 46x32 logical each. */
function CaptionButtons() {
  const stroke = { stroke: theme.foreground, strokeWidth: 2, fill: 'none', opacity: 0.8 } as const;
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, display: 'flex' }}>
      {[
        <path key="min" d="M-10 0 H10" {...stroke} />,
        <rect key="max" x={-9} y={-9} width={18} height={18} rx={3} {...stroke} />,
        <path key="close" d="M-9 -9 L9 9 M9 -9 L-9 9" {...stroke} />,
      ].map((glyph, i) => (
        <svg key={i} width={92} height={64} viewBox="-46 -32 92 64">
          {glyph}
        </svg>
      ))}
    </div>
  );
}

/**
 * Stands in for a take until its recording lands: the nvoke window's calm
 * canvas, the glass island, caption buttons, and the rects the scenes aim the
 * camera at, drawn as quiet skeletons with their names. Drawn at the take's
 * native 2400x1350 so camera moves and the cursor line up with the real thing.
 */
export const TakePlaceholder: React.FC<{ take: Take }> = ({ take }) => {
  return (
    <div
      style={{
        position: 'absolute',
        width: TAKE_WIDTH,
        height: TAKE_HEIGHT,
        background: `linear-gradient(180deg, oklch(0.985 0.002 265) 0%, ${theme.background} 40%, oklch(0.975 0.004 268) 100%)`,
        fontFamily: fonts.text,
        overflow: 'hidden',
      }}
    >
      {/* Ambient iris, as the app's aura shows it while a search runs. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(1400px 520px at 50% 108%, oklch(0.62 0.2 268 / 0.1), oklch(0.62 0.2 268 / 0) 70%)`,
        }}
      />
      <CaptionButtons />
      <div
        style={{
          position: 'absolute',
          top: 28,
          left: TAKE_WIDTH / 2 - 260,
          width: 520,
          height: 72,
          borderRadius: 36,
          background: theme.glassStrong,
          boxShadow: `inset 0 0 0 2px ${theme.glassEdge}, inset 0 2px 0 ${theme.glassHighlight}, 0 8px 24px -8px ${theme.shadowStrong}`,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '0 30px',
        }}
      >
        <div style={{ width: 22, height: 22, borderRadius: 11, border: `3px solid ${theme.mutedForeground}`, opacity: 0.6 }} />
        <div style={{ height: 14, width: 220, borderRadius: 7, background: theme.input }} />
      </div>
      {Object.entries(take.rects).map(([name, r]) => (
        <div
          key={name}
          style={{
            position: 'absolute',
            left: r.x,
            top: r.y,
            width: r.w,
            height: r.h,
            borderRadius: Math.min(28, r.h / 2),
            background: 'oklch(0.2 0.01 265 / 0.035)',
            boxShadow: `inset 0 0 0 2px oklch(0.2 0.01 265 / 0.07)`,
          }}
        >
          <div
            style={{
              position: 'absolute',
              // Tall rects label their bottom corner, so a row inside them keeps its own label clear.
              ...(r.h > 200 ? { right: 22, bottom: 16 } : { left: 22, top: Math.min(18, r.h / 2 - 14) }),
              fontFamily: fonts.mono,
              fontSize: 24,
              color: theme.mutedForeground,
              opacity: 0.75,
              whiteSpace: 'nowrap',
            }}
          >
            {name}
          </div>
        </div>
      ))}
      <div
        style={{
          position: 'absolute',
          left: 72,
          bottom: 56,
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
          color: theme.mutedForeground,
        }}
      >
        <span style={{ fontFamily: fonts.mono, fontSize: 34, color: theme.foreground, opacity: 0.7 }}>{take.take}</span>
        <span style={{ fontSize: 28 }}>take pending</span>
      </div>
    </div>
  );
};
