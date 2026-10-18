import type React from 'react';
import { theme } from '../theme';

/** The glyph, as in apps/site/components/site/logo.tsx (LOGO) and the desktop Logo. */
const LOGO = {
  arch: 'M7 15V11a5 5 0 0 1 10 0v4',
  poles: 'M7 16.3v3.2M17 16.3v3.2',
  lead: { cx: 12, cy: 16.7, r: 1.9 },
  stroke: 3,
};

export interface LogoMarkProps {
  size: number;
  /** 0 to 1: the arch draws (stroke dash), as logo-intro does in packages/theme/motion.css. */
  arch?: number;
  /** 0 to 1: the poles fade in. */
  poles?: number;
  /** 0 to 1: the lead is pulled up in under the arch. May overshoot past 1 for a spring. */
  lead?: number;
  /** 0 to 1: strength of the key's orange glow. */
  glow?: number;
}

/**
 * The nvoke mark: a lowercase n drawn as a horseshoe magnet pulling a lead
 * (the dot) in under the arch, on the orange keycap of the desktop's panel.
 */
export const LogoMark: React.FC<LogoMarkProps> = ({ size, arch = 1, poles = 1, lead = 1, glow = 1 }) => {
  const dash = 30;
  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: size * 0.14,
        background: 'linear-gradient(180deg, oklch(0.74 0.19 44) 0%, oklch(0.7 0.21 40) 55%, oklch(0.64 0.21 37) 100%)',
        boxShadow: [
          `inset 0 ${size * 0.012}px 0 oklch(1 0 0 / 0.32)`,
          `inset 0 -${size * 0.06}px 0 oklch(0 0 0 / 0.22)`,
          `0 ${size * 0.06}px 0 oklch(0.42 0.004 100)`,
          `0 ${size * 0.08}px ${size * 0.3}px -${size * 0.06}px oklch(0.7 0.21 40 / ${0.5 * glow})`,
          `0 ${size * 0.2}px ${size * 0.8}px -${size * 0.1}px oklch(0.7 0.21 40 / ${0.3 * glow})`,
        ].join(', '),
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, oklch(1 0 0 / 0.22) 0%, oklch(1 0 0 / 0) 55%)',
        }}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ position: 'absolute', left: size * 0.19, top: size * 0.19, width: size * 0.62, height: size * 0.62 }}
      >
        <path
          d={LOGO.arch}
          stroke={theme.primaryForeground}
          strokeWidth={LOGO.stroke} strokeLinecap="square"
          strokeDasharray={dash}
          strokeDashoffset={dash * (1 - arch)}
        />
        <path d={LOGO.poles} stroke={theme.primaryForeground} strokeWidth={LOGO.stroke} strokeLinecap="square" opacity={poles} />
        <circle
          cx={LOGO.lead.cx}
          cy={LOGO.lead.cy + 9 * (1 - lead)}
          r={LOGO.lead.r * (0.6 + 0.4 * Math.min(1, lead))}
          fill={theme.primaryForeground}
          opacity={Math.min(1, Math.max(0, lead * 1.6))}
        />
      </svg>
    </div>
  );
};
