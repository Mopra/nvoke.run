import type React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { auraColor, auraDeepColor, auraSoftColor, theme } from '../theme';

/**
 * A soft gaussian falloff written as gradient stops. A plain two stop radial
 * gradient has a visible edge and bands in H.264; many stops on an
 * exp(-r^2) curve read as light, not as a shape.
 */
function glow(color: (alpha: number) => string, alpha: number, shape: string) {
  const stops: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = i / 12;
    const a = alpha * Math.exp(-4.2 * r * r) * (1 - r * r * 0.06);
    stops.push(`${color(i === 12 ? 0 : a)} ${(r * 100).toFixed(1)}%`);
  }
  return `radial-gradient(${shape}, ${stops.join(', ')})`;
}

/**
 * Tiled monochrome noise. Soft light keeps pure white untouched and dithers
 * the tinted areas, which is where H.264 would band.
 */
const GRAIN = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.92' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>`,
)}")`;

export interface BackdropProps {
  /** Aura strength. 0 is a bare canvas, 1 is a calm glow, 1.4 is a running search. */
  intensity: number;
  /** Where the aura gathers, as fractions of the frame. Defaults to just below center. */
  focus?: { x: number; y: number };
  /** How far apart the three lights sit. 1 is a wide wash, lower gathers them into one calm glow. */
  spread?: number;
  grain?: boolean;
  /** The canvas color under the lights. Defaults to the light theme's background. */
  base?: string;
  children?: React.ReactNode;
}

/**
 * The film's canvas: near white with the iris aura drifting under everything.
 * Three lights (iris core, a cool blue wash, a violet undertone) wander on
 * slow, unrelated sine paths so the light never visibly loops.
 */
export const Backdrop: React.FC<BackdropProps> = ({
  intensity,
  focus = { x: 0.5, y: 0.62 },
  spread = 1,
  grain = true,
  base = theme.background,
  children,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const t = frame / fps;
  const i = Math.max(0, intensity);
  const span = Math.max(width, height);
  // The lights grow a little as they brighten, like a bloom.
  const grow = 0.75 + Math.min(i, 1.6) * 0.25;

  const drift = (ax: number, ay: number, px: number, py: number, phase: number) => ({
    x: (focus.x + Math.sin(t * px + phase) * ax * spread) * width,
    y: (focus.y + Math.cos(t * py + phase * 1.7) * ay * spread) * height,
  });

  const core = drift(0.06, 0.04, 0.11, 0.083, 0.4);
  const wash = drift(0.12, 0.06, 0.071, 0.097, 2.1);
  const deep = drift(0.09, 0.05, 0.059, 0.067, 4.2);

  const layers = [
    glow(auraColor, 0.15 * i, `${span * 0.5 * grow}px ${span * 0.26 * grow}px at ${core.x}px ${core.y}px`),
    glow(auraSoftColor, 0.17 * i, `${span * 0.62 * grow}px ${span * 0.32 * grow}px at ${wash.x - width * 0.16 * spread}px ${wash.y + height * 0.04 * spread}px`),
    glow(auraDeepColor, 0.09 * i, `${span * 0.5 * grow}px ${span * 0.28 * grow}px at ${deep.x + width * 0.18 * spread}px ${deep.y}px`),
  ];

  return (
    <AbsoluteFill style={{ backgroundColor: base }}>
      <AbsoluteFill style={{ backgroundImage: layers.join(', ') }} />
      {grain && (
        <AbsoluteFill
          style={{
            backgroundImage: GRAIN,
            backgroundSize: '240px 240px',
            mixBlendMode: 'soft-light',
            opacity: 0.55,
          }}
        />
      )}
      {children}
    </AbsoluteFill>
  );
};
