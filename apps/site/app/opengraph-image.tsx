import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { LOGO } from '@/components/site/logo';
import { site } from '@/lib/site';
import { themeColors } from '@/lib/theme-colors';

export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ROWS = [
  { company: 'Smile Studio Frederiksberg', email: 'hello@smilestudiofrederiksberg.dk', status: 'Valid', dot: 'chart-1' },
  { company: 'Nordhavn Tandklinik', email: 'noah.hansen@nordhavntandklinik.dk', status: 'Valid', dot: 'chart-1' },
  { company: 'Dental Sydhavn', email: 'kontakt@dentalsydhavn.dk', status: 'Catch-all', dot: 'chart-3' },
  { company: 'Holte Dental', email: 'booking@holtedental.dk', status: 'Risky', dot: 'chart-2' },
  { company: 'Tandlægerne Gentofte', email: 'mail@tandlaegernegentofte.dk', status: 'Valid', dot: 'chart-1' },
];

function font(file: string): Buffer {
  return readFileSync(join(process.cwd(), 'node_modules', 'geist', 'dist', 'fonts', file));
}

/** The share card: dark, like the app at night, with a slice of a results window. */
export default function OpengraphImage() {
  const t = themeColors('dark');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: t.get('background'),
          color: t.get('foreground'),
          fontFamily: 'Geist',
          overflow: 'hidden',
        }}
      >
        {/* The accent's halo, low and to the right, behind the window. */}
        <div
          style={{
            position: 'absolute',
            left: 300,
            top: 160,
            width: 1000,
            height: 760,
            display: 'flex',
            backgroundImage: `radial-gradient(ellipse at center, ${t.get('primary')} 0%, transparent 60%)`,
            opacity: 0.5,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '64px 0 64px 72px',
            width: 600,
            position: 'relative',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 13,
                background: t.get('primary'),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 8px 28px -6px ${t.get('glow')}`,
              }}
            >
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d={`${LOGO.arch}${LOGO.poles}`} stroke={t.get('primary-foreground')} strokeWidth={LOGO.stroke} />
                <circle cx={LOGO.lead.cx} cy={LOGO.lead.cy} r={LOGO.lead.r} fill={t.get('primary-foreground')} />
              </svg>
            </div>
            <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -1 }}>{site.name}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ fontSize: 66, fontWeight: 600, lineHeight: 1.02, letterSpacing: -2.2 }}>{site.tagline}</div>
            <div style={{ fontSize: 25, lineHeight: 1.35, color: t.get('muted-foreground') }}>
              Verified business emails. Windows, macOS and Linux.
            </div>
          </div>
        </div>

        {/* A slice of the app window, running off the right and bottom edges. */}
        <div
          style={{
            position: 'absolute',
            left: 650,
            top: 120,
            width: 600,
            height: 560,
            display: 'flex',
            flexDirection: 'column',
            borderRadius: 16,
            border: `1px solid ${t.get('border')}`,
            background: t.get('card'),
            boxShadow: `0 30px 80px -20px ${t.get('shadow-strong')}`,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '20px 24px' }}>
            <div style={{ width: 13, height: 13, borderRadius: 7, background: t.get('window-close') }} />
            <div style={{ width: 13, height: 13, borderRadius: 7, background: t.get('window-minimize') }} />
            <div style={{ width: 13, height: 13, borderRadius: 7, background: t.get('window-zoom') }} />
            <div style={{ marginLeft: 18, fontSize: 19, fontWeight: 600, letterSpacing: -0.3 }}>
              Dentists in Copenhagen
            </div>
          </div>
          <div style={{ display: 'flex', margin: '0 24px 14px', height: 6, borderRadius: 3, background: t.get('border') }}>
            <div style={{ width: '78%', height: 6, borderRadius: 3, background: t.get('primary') }} />
          </div>
          {ROWS.map((row) => (
            <div
              key={row.email}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 24px',
                borderTop: `1px solid ${t.get('border')}`,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{row.company}</div>
                <div style={{ fontFamily: 'Geist Mono', fontSize: 15, color: t.get('muted-foreground') }}>
                  {row.email}
                </div>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 14,
                  padding: '4px 12px 4px 10px',
                  borderRadius: 999,
                  background: t.get('accent'),
                  marginRight: 56,
                }}
              >
                <div style={{ width: 8, height: 8, borderRadius: 4, background: t.get(row.dot) }} />
                {row.status}
              </div>
            </div>
          ))}
        </div>

      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Geist', data: font('geist-sans/Geist-SemiBold.ttf'), weight: 600, style: 'normal' },
        { name: 'Geist', data: font('geist-sans/Geist-Regular.ttf'), weight: 400, style: 'normal' },
        { name: 'Geist Mono', data: font('geist-mono/GeistMono-Regular.ttf'), weight: 400, style: 'normal' },
      ],
    },
  );
}
