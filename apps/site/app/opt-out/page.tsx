import type { Metadata } from 'next';
import Link from 'next/link';
import { OptOutForm } from '@/components/site/opt-out-form';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Opt out',
  description:
    'Remove your email address or your whole domain from nvoke. Immediate, no confirmation, never collected again.',
  alternates: { canonical: '/opt-out' },
};

export default function OptOutPage() {
  return (
    <>
      <PageHeader
        title="Opt out of nvoke"
        intro="Enter your email address or your company’s domain. We delete what we hold, right now, and never collect it again. No account. No confirmation email."
      />
      <Container className="pb-24 sm:pb-36">
        <div className="mx-auto flex max-w-3xl flex-col gap-12">
          <OptOutForm />
          <div className="flex flex-col gap-4 text-[17px] leading-relaxed text-pretty text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-foreground">
            <h2>What happens</h2>
            <p>
              An email address is deleted from our shared cache and from the search results of every nvoke customer, and
              nvoke will not collect it again. A domain covers every address on it and its subdomains, and nvokebot
              stops visiting the site. Shared mailbox providers such as gmail.com cannot be opted out as a whole domain,
              because that would hide every business using them. Opt out your own address instead.
            </p>
            <p>
              It is permanent. To remember your choice we keep only a one-way hash (sha256) of the address or domain. We
              can recognise the address if we see it again. Nobody can turn the hash back into the address.
            </p>
            <p>
              The page shows the same message whether or not we held anything. Nobody can use it to probe which
              addresses are in nvoke.
            </p>
            <h2 className="mt-4">Other requests</h2>
            <p>
              To see what we hold about you, correct it or object to our processing, write to{' '}
              <a href={`mailto:${site.email.privacy}`}>{site.email.privacy}</a>. We answer within one month. The{' '}
              <Link href="/privacy">privacy policy</Link> explains what we collect and why, and the{' '}
              <Link href="/bot">nvokebot page</Link> explains how to block our crawler with robots.txt.
            </p>
            <p>
              Customers may already have exported a file before you opted out. We cannot delete copies outside nvoke,
              but our terms require customers to honour objections. You can object directly to anyone who contacts
              you.
            </p>
          </div>
        </div>
      </Container>
    </>
  );
}
