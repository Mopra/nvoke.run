import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { LOGO } from '@/components/site/logo';
import { site } from '@/lib/site';
import { themeColors } from '@/lib/theme-colors';

export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function font(file: string): Buffer {
  return readFileSync(join(process.cwd(), 'node_modules', 'geist', 'dist', 'fonts', file));
}

const FIGURES = [
  { label: 'COMPANIES', value: '48' },
  { label: 'EMAILS', value: '112' },
  { label: 'VALID', value: '71' },
];

/**
 * The share card: a plate on the light chassis, the mark and the line on it,
 * and the black screen with a finished search's figures. Satori reads no
 * woff2, so Geist and Geist Mono stand in for the device's faces.
 */
export default function OpengraphImage() {
  const t = themeColors('light');
  const screen = t.get('screen');
  const lit = t.get('screen-foreground');
  const dim = t.get('screen-dim');
  const label = t.get('muted-foreground');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          padding: 40,
          background: t.get('background'),
          fontFamily: 'Geist',
        }}
      >
        <div
          style={{
            display: 'flex',
            flex: 1,
            gap: 48,
            padding: 56,
            borderRadius: 10,
            background: t.get('card'),
            border: `2px solid ${t.get('border')}`,
            color: t.get('foreground'),
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: 560 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: t.get('primary'),
                  boxShadow: `0 4px 0 ${t.get('shadow-strong')}`,
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d={LOGO.arch} stroke={t.get('primary-foreground')} strokeWidth={LOGO.stroke} strokeLinecap="square" />
                  <path d={LOGO.poles} stroke={t.get('primary-foreground')} strokeWidth={LOGO.stroke} strokeLinecap="square" />
                  <circle {...LOGO.lead} fill={t.get('primary-foreground')} />
                </svg>
              </div>
              <div style={{ fontSize: 44, fontWeight: 300, letterSpacing: -0.5 }}>{site.name}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              <div
                style={{ fontFamily: 'Geist Mono', fontSize: 20, letterSpacing: 2, color: t.get('primary') }}
              >
                FIND · CRAWL · VERIFY
              </div>
              <div style={{ fontSize: 64, fontWeight: 300, lineHeight: 1.04, letterSpacing: -2 }}>{site.tagline}</div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              flex: 1,
              padding: 36,
              borderRadius: 6,
              background: screen,
              color: lit,
              fontFamily: 'Geist Mono',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 18, letterSpacing: 2 }}>
              <div style={{ width: 12, height: 12, borderRadius: 6, background: t.get('chart-1') }} />
              <span style={{ color: label }}>RUN</span>
              <span style={{ color: t.get('primary') }}>DONE</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: 0 }}>DENTISTS IN AUSTIN</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {Array.from({ length: 16 }, (_, i) => (
                  <div key={i} style={{ flex: 1, height: 14, borderRadius: 2, background: t.get('primary') }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {FIGURES.map((f) => (
                <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <span style={{ fontSize: 14, letterSpacing: 1.5, color: f.label === 'VALID' ? t.get('primary') : label }}>
                    {f.label}
                  </span>
                  <div style={{ display: 'flex', position: 'relative', fontSize: 46, fontWeight: 700 }}>
                    <span style={{ color: dim }}>888</span>
                    <span style={{ position: 'absolute', right: 0, top: 0 }}>{f.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: font('geist-sans/Geist-Light.ttf'), weight: 300, style: 'normal' },
        { name: 'Geist Mono', data: font('geist-mono/GeistMono-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Geist Mono', data: font('geist-mono/GeistMono-Bold.ttf'), weight: 700, style: 'normal' },
      ],
    },
  );
}
