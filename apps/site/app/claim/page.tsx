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
    <section className="relative">
      <div className="relative mx-auto flex min-h-[70dvh] max-w-md flex-col items-center gap-8 px-4 py-16 sm:px-6 sm:py-24">
        <LogoMark className="size-12" />
        <Claim />
      </div>
    </section>
  );
}
