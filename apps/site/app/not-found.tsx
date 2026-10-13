import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="halo pointer-events-none absolute top-1/2 left-1/2 h-96 w-[48rem] max-w-[140vw] -translate-x-1/2 -translate-y-1/2 opacity-30 dark:opacity-50"
      />
      <Container className="relative flex flex-col items-center gap-6 py-28 text-center sm:py-40">
        <p className="bg-linear-to-b from-foreground/25 to-foreground/5 bg-clip-text text-[clamp(6rem,4rem+12vw,12rem)] leading-none font-semibold tracking-[-0.06em] text-transparent tabular-nums">
          404
        </p>
        <h1 className="max-w-xl text-title font-semibold text-balance">Nothing here.</h1>
        <p className="max-w-md text-lede text-pretty text-muted-foreground">
          Old link or a typo. Either way, this page does not exist.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/download">Download nvoke</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
