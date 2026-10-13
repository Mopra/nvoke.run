import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { site } from '@/lib/site';
import { themeColors } from '@/lib/theme-colors';

export const alt = `${site.name}: ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ROWS = [
  { email: 'kontakt@nbtand.dk', status: 'Valid', dot: 'chart-1' },
  { email: 'mette@oesterbrotand.dk', status: 'Valid', dot: 'chart-1' },
  { email: 'info@vbtandhus.dk', status: 'Catch-all', dot: 'chart-3' },
];

function font(file: string): Buffer {
  return readFileSync(join(process.cwd(), 'node_modules', 'geist', 'dist', 'fonts', file));
}

export default function OpengraphImage() {
  const t = themeColors('light');

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: t.get('sidebar'),
          color: t.get('foreground'),
          fontFamily: 'Geist',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: t.get('primary'),
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 5,
              padding: '0 9px',
            }}
          >
            <div style={{ height: 5, borderRadius: 3, background: t.get('primary-foreground') }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, background: t.get('ring') }} />
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: t.get('muted-foreground') }} />
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>{site.name}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 640 }}>
            <div style={{ fontSize: 72, fontWeight: 600, lineHeight: 1.02, letterSpacing: -3 }}>{site.tagline}</div>
            <div style={{ fontSize: 26, color: t.get('muted-foreground') }}>
              Verified business emails. Windows, macOS and Linux.
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: 400,
              borderRadius: 16,
              border: `1px solid ${t.get('border')}`,
              background: t.get('card'),
              overflow: 'hidden',
            }}
          >
            {ROWS.map((row, i) => (
              <div
                key={row.email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 22px',
                  borderTop: i === 0 ? 'none' : `1px solid ${t.get('border')}`,
                  fontSize: 20,
                }}
              >
                <div style={{ fontFamily: 'Geist Mono', fontSize: 18 }}>{row.email}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16 }}>
                  <div style={{ width: 9, height: 9, borderRadius: 5, background: t.get(row.dot) }} />
                  {row.status}
                </div>
              </div>
            ))}
          </div>
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
