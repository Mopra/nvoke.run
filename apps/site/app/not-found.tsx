import type { Metadata } from 'next';
import Link from 'next/link';
import { Figure } from '@/components/mockups/parts';
import { Container } from '@/components/site/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

/** The 404 as a display: the code in huge dot matrix figures, one line, the key home. */
export default function NotFound() {
  return (
    <Container className="flex flex-col items-center py-20 text-center sm:py-32">
      <div className="screen screen-hero w-full max-w-3xl p-6 sm:p-10">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="led bg-destructive shadow-[0_0_6px_var(--destructive)] motion-safe:animate-blink" />
          <span className="cap text-destructive">Error</span>
          <span className="cap ml-auto text-screen-foreground/60">No signal</span>
        </div>
        <Figure value="404" ghost="888" className="mt-8 text-[clamp(6rem,30vw,15rem)] sm:mt-10" />
        <p className="cap mt-6 text-screen-foreground/60">Page not found</p>
      </div>
      <h1 className="mt-16 text-headline font-light sm:mt-20">Nothing here.</h1>
      <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">Old link or a typo. The page does not exist.</p>
      <Button asChild size="xl" variant="dark" className="mt-10">
        <Link href="/">Home</Link>
      </Button>
    </Container>
  );
}
