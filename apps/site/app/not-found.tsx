import type { Metadata } from 'next';
import Link from 'next/link';
import { Container } from '@/components/site/section';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <Container className="flex flex-col items-start gap-6 py-24 sm:py-32">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
        There is no page at this address.
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        The link may be old or mistyped. Try the home page or the download page.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/download">Download nvoke</Link>
        </Button>
      </div>
    </Container>
  );
}
