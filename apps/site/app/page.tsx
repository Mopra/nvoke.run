import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { site } from '@/lib/site';

// Placeholder landing page. Real copy comes later.
export default function HomePage() {
  return (
    <section className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{site.name}</h1>
      <p className="max-w-xl text-lg text-muted-foreground">{site.description}</p>
      <Button asChild size="lg">
        <Link href="/download">Download</Link>
      </Button>
    </section>
  );
}
