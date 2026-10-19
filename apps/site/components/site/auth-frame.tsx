import type { ReactNode } from 'react';
import Link from 'next/link';
import { SiteClerkProvider } from '@/components/site/clerk';
import { RevealHeading } from '@/components/site/home/reveal';

/**
 * Sign in and sign up on the paper: a lit label, one light title that rises
 * in and a short line, then Clerk's form between hairlines (no card). Beside
 * it on wide screens, under it on phones, a display that shows what is
 * waiting on the other side.
 */
export function AuthFrame({
  title,
  lede,
  label = 'Find · Crawl · Verify',
  display,
  children,
}: {
  title: string;
  lede: string;
  label?: string;
  display?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="relative">
      <div className="mx-auto grid min-h-[80dvh] max-w-6xl items-center gap-14 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,28rem)_1fr] lg:gap-20">
        <div className="flex flex-col items-start gap-8">
          <div className="flex flex-col items-start gap-5">
            <span className="cap flex items-center gap-2 text-primary">
              <span className="led led-on" />
              {label}
            </span>
            <RevealHeading as="h1" lines={[title]} className="text-headline font-light" />
            <p className="max-w-sm text-lede text-pretty text-muted-foreground">{lede}</p>
          </div>
          <div className="w-full max-w-[400px]">
            <SiteClerkProvider>{children}</SiteClerkProvider>
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="cap">An AI agent?</span>
            <Link
              href="/agents"
              className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              It signs up on its own.
            </Link>
          </p>
        </div>
        {display ? <div className="min-w-0">{display}</div> : null}
      </div>
    </section>
  );
}
