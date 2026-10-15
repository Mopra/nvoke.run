import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SiteChrome } from '@/components/site/site-chrome';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeScript } from '@/components/site/theme-script';
import { site } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${site.name}: ${site.tagline}`, template: `%s | ${site.name}` },
  description: site.description,
  metadataBase: new URL(site.url),
  openGraph: { type: 'website', siteName: site.name, url: '/' },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
        <link rel="alternate" type="text/markdown" href="/agents.md" title="nvoke for agents" />
      </head>
      <body className="flex min-h-dvh flex-col">
        <SiteChrome>
          <SiteHeader />
        </SiteChrome>
        <main className="flex-1">{children}</main>
        <SiteChrome>
          <SiteFooter />
        </SiteChrome>
      </body>
    </html>
  );
}
