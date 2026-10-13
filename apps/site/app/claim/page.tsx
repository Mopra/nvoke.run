import type { Metadata } from 'next';
import { LogoMark } from '@/components/site/logo';
import { Claim } from './claim';

export const metadata: Metadata = {
  title: 'Claim your account',
  robots: { index: false, follow: false },
};

/**
 * Where the claim email lands: `/claim#ticket=...`. The ticket sits in the
 * fragment so it never reaches a server log or a Referer header.
 */
export default function ClaimPage() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="halo pointer-events-none absolute top-24 left-1/2 h-[30rem] w-[44rem] max-w-[140vw] -translate-x-1/2 opacity-35 dark:opacity-40"
      />
      <div className="relative mx-auto flex min-h-[70dvh] max-w-md flex-col items-center gap-8 px-6 py-16 sm:py-24">
        <LogoMark className="size-14" />
        <Claim />
      </div>
    </section>
  );
}
