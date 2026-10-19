import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/site/logo';
import { SiteClerkProvider } from '@/components/site/clerk';
import { RevealHeading } from '@/components/site/home/reveal';

/**
 * Sign in and sign up on the paper: the mark, a lit label and one light title
 * that rises in, then Clerk's form between hairlines (no card), and the way
 * in for agents.
 */
export function AuthFrame({
  title,
  lede,
  label = 'Find · Crawl · Verify',
  children,
}: {
  title: string;
  lede: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="relative">
      <div className="relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center gap-7 px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark className="size-11" />
          <span className="cap flex items-center gap-2 text-muted-foreground">
            <span className="led led-on" />
            {label}
          </span>
          <RevealHeading as="h1" lines={[title]} className="font-display text-5xl font-light tracking-[-0.03em] text-balance" />
          <p className="max-w-sm text-sm text-pretty text-muted-foreground">{lede}</p>
        </div>
        <SiteClerkProvider>{children}</SiteClerkProvider>
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-sm text-muted-foreground">
          <span className="cap">An AI agent?</span>
          <Link
            href="/agents"
            className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            It signs up on its own.
          </Link>
        </p>
      </div>
    </section>
  );
}
