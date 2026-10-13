import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { site } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: site.name, template: `%s | ${site.name}` },
  description: site.description,
  metadataBase: new URL(site.url),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="flex min-h-dvh flex-col">
        <header className="border-b bg-sidebar">
          <nav className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
            <Link href="/" className="font-semibold tracking-tight">
              {site.name}
            </Link>
            <Link href="/download" className="text-sm text-muted-foreground hover:text-foreground">
              Download
            </Link>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t">
          <div className="mx-auto max-w-5xl px-6 py-6 text-sm text-muted-foreground">{site.name}</div>
        </footer>
      </body>
    </html>
  );
}
