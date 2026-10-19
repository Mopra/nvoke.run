import type { Metadata } from 'next';
import Link from 'next/link';
import { RevealHeading } from '@/components/site/home/reveal';
import { OptOutForm } from '@/components/site/opt-out-form';
import { Container } from '@/components/site/section';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Opt out',
  description:
    'Remove your email address or your whole domain from nvoke. Immediate, no confirmation, never collected again.',
  alternates: { canonical: '/opt-out' },
};

const FACTS = [
  {
    title: 'Gone now',
    body: 'An address leaves our cache and every customer’s results. A domain covers every address on it and its subdomains, and nvokebot stops visiting.',
  },
  {
    title: 'Kept as a hash',
    body: 'To remember your choice we keep a one-way sha256 hash. We recognise the address again. Nobody can turn the hash back.',
  },
  {
    title: 'Reveals nothing',
    body: 'The answer is the same whether we held anything or not. Nobody can use this page to probe what is in nvoke.',
  },
];

const link = 'text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground';

export default function OptOutPage() {
  return (
    <>
      <section className="pt-16 pb-20 sm:pt-28 sm:pb-28">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="cap text-primary">Privacy</p>
            <RevealHeading as="h1" className="mt-6 text-display font-light" lines={['Opt out of nvoke.']} />
            <p className="mt-6 max-w-lg text-lede text-pretty text-muted-foreground">
              Your address or your whole domain. Deleted now, never collected again. No account, no confirmation email.
            </p>
          </div>
          <div className="mx-auto mt-14 max-w-2xl sm:mt-20">
            <OptOutForm />
          </div>
        </Container>
      </section>

      <section aria-labelledby="what-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="what-title" className="text-headline font-light" lines={['What happens.']} />
          <ol className="mt-14 grid gap-x-10 gap-y-12 sm:mt-20 md:grid-cols-3">
            {FACTS.map((f, i) => (
              <li key={f.title} className="border-t pt-6">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="led led-on" />
                  <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <h3 className="mt-8 text-title font-light">{f.title}</h3>
                <p className="mt-3 max-w-xs text-[15px] text-pretty text-muted-foreground">{f.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-12 max-w-2xl text-[15px] text-pretty text-muted-foreground">
            Shared mailbox providers such as gmail.com cannot be opted out as a whole domain, because that would hide
            every business on them. Opt out your own address instead.
          </p>
        </Container>
      </section>

      <section aria-labelledby="other-title" className="pt-20 pb-24 sm:pt-28 sm:pb-36">
        <Container className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <RevealHeading id="other-title" className="text-headline font-light" lines={['Other requests.']} />
          <div className="flex flex-col border-y text-[15px] text-pretty text-muted-foreground sm:text-base">
            <p className="py-5">
              To see, correct or object to what we hold, write to{' '}
              <a href={`mailto:${site.email.privacy}`} className={link}>
                {site.email.privacy}
              </a>
              . We answer within one month.
            </p>
            <p className="border-t py-5">
              The{' '}
              <Link href="/privacy" className={link}>
                privacy policy
              </Link>{' '}
              says what we collect and why. The{' '}
              <Link href="/bot" className={link}>
                nvokebot page
              </Link>{' '}
              shows how to block our crawler in robots.txt.
            </p>
            <p className="border-t py-5">
              Files customers exported before you opted out are outside our reach. Our terms make them honour objections,
              and you can object to anyone who contacts you.
            </p>
          </div>
        </Container>
      </section>
    </>
  );
}
