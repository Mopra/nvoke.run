import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/site/logo';
import { SiteClerkProvider } from '@/components/site/clerk';

/**
 * Sign in and sign up on the chassis: the mark, a printed label and one light
 * title, then Clerk's form as a plate, and the way in for agents. No halo,
 * no glass: the page is the chassis tone and the form is the one object on it.
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
    <section className="rim relative">
      <div className="relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center gap-7 px-4 py-14 sm:px-6 sm:py-20">
        <div className="flex flex-col items-center gap-4 text-center">
          <LogoMark className="size-11" />
          <span className="cap text-primary">{label}</span>
          <h1 className="font-display text-4xl font-light tracking-[-0.02em] text-balance">{title}</h1>
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
