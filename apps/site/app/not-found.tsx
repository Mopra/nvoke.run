import type { Metadata } from 'next';
import Link from 'next/link';
import { Figure } from '@/components/mockups/parts';
import { Container } from '@/components/site/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="panel flex flex-col items-center gap-6 px-5 py-14 text-center sm:py-20">
        <div className="screen flex items-center gap-4 px-6 py-5">
          <span className="led bg-destructive shadow-[0_0_6px_var(--destructive)]" />
          <span className="cap text-screen-foreground/50">Error</span>
          <Figure value="404" ghost="888" className="text-[56px] sm:text-[72px]" />
        </div>
        <h1 className="text-headline font-light">Nothing here.</h1>
        <p className="max-w-md text-lede text-pretty text-muted-foreground">
          Old link or a typo. Either way, this page does not exist.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Button asChild size="lg" variant="dark">
            <Link href="/">Home page</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href="/download">nvoke Desktop</Link>
          </Button>
        </div>
      </div>
    </Container>
  );
}
