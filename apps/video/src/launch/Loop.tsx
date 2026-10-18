import type React from 'react';
import { Bell, Rocket, Send, Webhook, type LucideIcon } from 'lucide-react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { LogoMark } from '../components/LogoMark';
import { fonts } from '../fonts';
import { dark } from './palette';

/*
 * The automation loop from the site's lead journey (apps/site,
 * components/site/journey-scenes.tsx, LoopScene), drawn for the film: a
 * rounded track with four stops, a lead going round and lighting each stop as
 * it passes, the week's bars rising in the middle. Same geometry as the site
 * (viewBox 400x340), driven by frames instead of CSS.
 */

const VIEW_W = 400;
const VIEW_H = 340;
const LOOP = 'M100 40H300A60 60 0 0 1 360 100V240A60 60 0 0 1 300 300H100A60 60 0 0 1 40 240V100A60 60 0 0 1 100 40Z';

/** The track as segments, clockwise from the top left stop, for a point at a share of its length. */
const ARC = (Math.PI / 2) * 60;
const SEGMENTS: { len: number; at: (k: number) => { x: number; y: number } }[] = [
  { len: 200, at: (k) => ({ x: 100 + 200 * k, y: 40 }) },
  { len: ARC, at: (k) => ({ x: 300 + 60 * Math.sin((k * Math.PI) / 2), y: 100 - 60 * Math.cos((k * Math.PI) / 2) }) },
  { len: 140, at: (k) => ({ x: 360, y: 100 + 140 * k }) },
  { len: ARC, at: (k) => ({ x: 300 + 60 * Math.cos((k * Math.PI) / 2), y: 240 + 60 * Math.sin((k * Math.PI) / 2) }) },
  { len: 200, at: (k) => ({ x: 300 - 200 * k, y: 300 }) },
  { len: ARC, at: (k) => ({ x: 100 - 60 * Math.sin((k * Math.PI) / 2), y: 240 + 60 * Math.cos((k * Math.PI) / 2) }) },
  { len: 140, at: (k) => ({ x: 40, y: 240 - 140 * k }) },
  { len: ARC, at: (k) => ({ x: 100 - 60 * Math.cos((k * Math.PI) / 2), y: 100 - 60 * Math.sin((k * Math.PI) / 2) }) },
];
const TOTAL = SEGMENTS.reduce((n, s) => n + s.len, 0);

function pointAt(share: number): { x: number; y: number } {
  let d = (((share % 1) + 1) % 1) * TOTAL;
  for (const s of SEGMENTS) {
    if (d <= s.len) return s.at(d / s.len);
    d -= s.len;
  }
  return { x: 100, y: 40 };
}

const STOPS: { title: string; note: string; icon: LucideIcon | null; at: number; x: number; y: number }[] = [
  { title: 'A drop, daily', note: 'Product Hunt, Show HN, YC', icon: Rocket, at: 0, x: 0.25, y: 0.118 },
  { title: 'nvoke', note: 'reads sites, checks emails', icon: null, at: 0.189, x: 0.75, y: 0.118 },
  { title: 'Webhook', note: 'lead.ready to your URL', icon: Webhook, at: 0.5, x: 0.75, y: 0.882 },
  { title: 'Your email tool', note: 'via Zapier, Make or Clay', icon: Send, at: 0.689, x: 0.25, y: 0.882 },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_HEIGHTS = [0.55, 0.8, 0.45, 0.9, 0.65, 0.35, 0.7];

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export interface LoopProps {
  /** Width in px; the height follows the site's 400x340. */
  width: number;
  /** Frames one lap takes. */
  lap: number;
  /** Local frame the loop starts drawing in. */
  enterAt?: number;
  /** Frames between the days rising. */
  dayEvery: number;
}

export const Loop: React.FC<LoopProps> = ({ width, lap, enterAt = 0, dayEvery }) => {
  const frame = useCurrentFrame() - enterAt;
  const u = width / VIEW_W;
  const height = VIEW_H * u;
  /** A size the site gives in CSS px, where the 400 unit loop is about 576 px wide. */
  const px = (n: number) => (n / 1.44) * u;
  const appear = interpolate(frame, [0, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  // The track draws itself in, then the lead sets off.
  const drawn = interpolate(frame, [0, 30], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  const share = Math.max(0, frame - 18) / lap;
  const lead = pointAt(share);
  const trail = Array.from({ length: 24 }, (_, i) => pointAt(share - (i / 23) * 0.14));

  return (
    <div style={{ position: 'relative', width, height, opacity: appear, transform: `scale(${0.96 + appear * 0.04})` }}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width={width} height={height} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} fill="none">
        <defs>
          <filter id="lead-glow" x="-2" y="-2" width="5" height="5">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>
        <path d={LOOP} pathLength={100} stroke={dark.border} strokeWidth={1.5} strokeDasharray={`${drawn * 100} 100`} />
        {share > 0 &&
          trail.slice(1).map((p, i) => {
            const q = trail[i]!;
            return (
              <line
                key={i}
                x1={q.x}
                y1={q.y}
                x2={p.x}
                y2={p.y}
                stroke={dark.primary}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={(1 - i / 23) * 0.9}
              />
            );
          })}
        {share > 0 && (
          <>
            <circle cx={lead.x} cy={lead.y} r={9} fill={dark.primary} opacity={0.7} filter="url(#lead-glow)" />
            <circle cx={lead.x} cy={lead.y} r={4.5} fill={dark.primary} />
          </>
        )}
      </svg>

      {STOPS.map((s, i) => {
        // Lit while the lead passes, fading over a tenth of a lap.
        const since = ((((share - s.at) % 1) + 1) % 1) * lap;
        const lit = share >= s.at ? Math.max(0, 1 - since / (lap * 0.12)) : 0;
        const enter = interpolate(frame, [6 + i * 5, 30 + i * 5], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
        const Icon = s.icon;
        const card = width * 0.44;
        return (
          <div
            key={s.title}
            style={{
              position: 'absolute',
              left: s.x * width,
              top: s.y * height,
              width: card,
              transform: `translate(-50%, -50%) translateY(${(1 - enter) * px(10)}px) scale(${1 + lit * 0.04})`,
              opacity: enter,
              display: 'flex',
              alignItems: 'center',
              gap: px(10),
              padding: `${px(8)}px ${px(12)}px`,
              borderRadius: px(16),
              background: dark.card,
              border: `${Math.max(1, px(1))}px solid ${lit > 0.05 ? `oklch(0.6 0.21 268 / ${0.35 + lit * 0.5})` : dark.border}`,
              boxShadow: [
                `inset 0 1px 0 oklch(1 0 0 / 0.06)`,
                `0 ${px(6)}px ${px(20)}px oklch(0 0 0 / 0.35)`,
                `0 0 ${px(28) * lit}px oklch(0.6 0.22 268 / ${0.55 * lit})`,
              ].join(', '),
              fontFamily: fonts.text,
            }}
          >
            {Icon ? (
              <span
                style={{
                  width: px(24),
                  height: px(24),
                  flex: 'none',
                  borderRadius: 999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'oklch(1 0 0 / 0.06)',
                  color: lit > 0.05 ? dark.primary : dark.mutedForeground,
                }}
              >
                <Icon size={px(14)} strokeWidth={1.75} />
              </span>
            ) : (
              <LogoMark size={px(24)} glow={0.4 + lit * 0.6} />
            )}
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: px(12), lineHeight: 1.3, fontWeight: 500, color: dark.foreground, whiteSpace: 'nowrap' }}>
                {s.title}
              </span>
              <span style={{ display: 'block', fontSize: px(10.5), lineHeight: 1.35, color: dark.mutedForeground, whiteSpace: 'nowrap' }}>{s.note}</span>
            </span>
          </div>
        );
      })}

      {/* The middle: the week's leads stacking up, and the drop's notification. */}
      <div
        style={{
          position: 'absolute',
          left: '16%',
          right: '16%',
          top: '27%',
          bottom: '27%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: px(16),
          fontFamily: fonts.text,
        }}
      >
        <Toast px={px} frame={frame} at={Math.round(lap * 0.95)} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: px(10), height: px(80) }}>
          {DAYS.map((d, i) => {
            const grow = interpolate(frame - 20 - i * dayEvery, [0, 22], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: px(6), height: '100%', width: px(12) }}>
                <div
                  style={{
                    width: '100%',
                    height: `${(DAY_HEIGHTS[i] ?? 0.5) * 78 * Math.max(0.06, grow)}%`,
                    borderRadius: 999,
                    background: grow > 0.02 ? dark.primary : 'oklch(0.6 0.21 268 / 0.3)',
                    boxShadow: `0 0 ${px(12) * grow}px oklch(0.6 0.22 268 / ${0.45 * grow})`,
                  }}
                />
                <span style={{ fontSize: px(9), lineHeight: 1, color: dark.mutedForeground }}>{d}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function Toast({ px, frame, at }: { px: (n: number) => number; frame: number; at: number }) {
  const k = interpolate(frame, [at, at + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: easeOut });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: px(10),
        width: px(240),
        padding: `${px(8)}px ${px(12)}px`,
        borderRadius: px(16),
        background: 'oklch(0.26 0.006 265 / 0.85)',
        border: `${Math.max(1, px(1))}px solid ${dark.border}`,
        opacity: k,
        transform: `translateY(${(1 - k) * px(-8)}px)`,
      }}
    >
      <Bell size={px(14)} strokeWidth={1.75} color={dark.primary} style={{ flex: 'none' }} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: px(11.5), lineHeight: 1.35, fontWeight: 500, color: dark.foreground }}>Shopify launches</span>
        <span style={{ display: 'block', fontSize: px(10.5), lineHeight: 1.35, color: dark.mutedForeground }}>14 new launches, 9 valid emails</span>
      </span>
    </div>
  );
}
