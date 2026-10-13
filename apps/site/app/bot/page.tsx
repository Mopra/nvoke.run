import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { OptOutForm } from '@/components/site/opt-out-form';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'nvokebot',
  description:
    'nvokebot is the crawler behind nvoke. What it visits, what it collects, and how to block it with robots.txt or our opt-out list.',
  alternates: { canonical: '/bot' },
};

const FACTS = [
  { label: 'User agent', value: site.botUserAgent, mono: true },
  { label: 'Pages per site', value: 'At most 8, and at most 2 MB in total' },
  { label: 'Speed', value: 'At most 1 request per second to your domain' },
  { label: 'robots.txt', value: 'Read before the first request and followed' },
];

const BLOCK_ALL = `User-agent: nvokebot
Disallow: /`;

const BLOCK_SOME = `User-agent: nvokebot
Disallow: /team/
Disallow: /staff/`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted/60 px-4 py-3 font-mono text-sm leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-10 md:grid-cols-[14rem_1fr] md:gap-10">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex max-w-2xl flex-col gap-4 text-pretty text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function BotPage() {
  return (
    <>
      <PageHeader
        title="nvokebot"
        intro="nvokebot is the crawler behind nvoke. If you found it in your server logs, this page explains what it did and how to stop it."
      />
      <Container className="pb-20 sm:pb-28">
        <dl className="mb-12 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
          {FACTS.map((f) => (
            <div key={f.label} className="flex flex-col gap-1 bg-card p-5">
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className={f.mono ? 'font-mono text-sm break-words' : 'font-medium'}>{f.value}</dd>
            </div>
          ))}
        </dl>

        <Block title="Why it visited">
          <p>
            nvoke helps businesses find contact details of other businesses. When a customer runs a search and your
            company is in the results, for example because it is listed on OpenStreetMap or shows up in a web search,
            nvokebot visits your website to find the email addresses published there.
          </p>
          <p>
            It does not crawl the web at large. It only visits sites that came up in a customer search.
          </p>
        </Block>

        <Block title="What it reads">
          <p>
            The home page and up to seven pages that usually hold contact details: contact, about, team, imprint,
            privacy and legal pages. It stops at eight pages or 2 MB per site, whichever comes first.
          </p>
          <p>
            From those pages it keeps <strong>email addresses</strong> and the URL where each one was found. It does
            not log in, submit forms or read pages that robots.txt disallows. nvoke never sends email to the addresses
            it finds.
          </p>
        </Block>

        <Block title="Block it with robots.txt">
          <p>nvokebot reads your robots.txt before it fetches anything else. To keep it off your whole site:</p>
          <Code>{BLOCK_ALL}</Code>
          <p>To keep it out of certain folders only:</p>
          <Code>{BLOCK_SOME}</Code>
          <p>
            A rule for <strong>User-agent: *</strong> applies to nvokebot too, unless there is a more specific
            nvokebot group.
          </p>
        </Block>

        <Block title="Ask to be left out">
          <p>
            If you cannot change robots.txt, send us your domain. We put it on our opt-out list and nvokebot stops
            visiting it. You can also write directly to{' '}
            <a href={`mailto:${site.email.bot}`} className="text-foreground underline underline-offset-4">
              {site.email.bot}
            </a>
            .
          </p>
          <OptOutForm to={site.email.bot} />
          <p>
            If your own email address appears in nvoke results and you want it removed, write to{' '}
            <a href={`mailto:${site.email.privacy}`} className="text-foreground underline underline-offset-4">
              {site.email.privacy}
            </a>
            . The privacy policy explains your rights.
          </p>
        </Block>
      </Container>
    </>
  );
}
