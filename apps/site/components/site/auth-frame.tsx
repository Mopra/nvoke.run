import type { ReactNode } from 'react';
import Link from 'next/link';
import { LogoMark } from '@/components/site/logo';
import { SiteClerkProvider } from '@/components/site/clerk';

/** Sign in and sign up: the mark, one line, then Clerk's form on the halo, and the way in for agents. */
export function AuthFrame({ title, lede, children }: { title: string; lede: string; children: ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="halo pointer-events-none absolute top-24 left-1/2 h-[30rem] w-[44rem] max-w-[140vw] -translate-x-1/2 opacity-30 dark:opacity-35"
      />
      <div className="relative mx-auto flex min-h-[70dvh] max-w-2xl flex-col items-center gap-6 px-4 py-14 sm:px-6 sm:py-20">
        <LogoMark className="size-12" />
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-[-0.03em]">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{lede}</p>
        </div>
        <SiteClerkProvider>{children}</SiteClerkProvider>
        <p className="text-sm text-muted-foreground">
          An AI agent?{' '}
          <Link href="/agents" className="text-foreground underline-offset-4 hover:underline">
            It signs up on its own
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
