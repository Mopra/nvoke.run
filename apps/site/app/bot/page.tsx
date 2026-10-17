import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { OptOutForm } from '@/components/site/opt-out-form';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export const metadata: Metadata = {
  title: 'nvokebot',
  description:
    'nvokebot is the crawler behind nvoke. What it visits, what it keeps, and how to block it with robots.txt or opt out your domain right now.',
  alternates: { canonical: '/bot' },
};

const FACTS = [
  { label: 'User agent', value: site.botUserAgent, mono: true },
  { label: 'Pages per site', value: 'At most 8, and at most 2 MB in total' },
  { label: 'Speed', value: 'At most 1 request per second to your site, slower with Crawl-delay' },
  { label: 'robots.txt', value: 'Read before the first request and followed for User-agent: nvokebot' },
];

const BLOCK_ALL = `User-agent: nvokebot
Disallow: /`;

const BLOCK_SOME = `User-agent: nvokebot
Disallow: /team/
Disallow: /staff/`;

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-xl bg-foreground/[0.05] px-5 py-4 font-mono text-sm leading-relaxed text-foreground">
      <code>{children}</code>
    </pre>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-t py-12 md:grid-cols-[15rem_1fr] md:gap-12 md:py-16">
      <h2 className="text-2xl font-semibold tracking-[-0.025em] text-balance">{title}</h2>
      <div className="flex max-w-2xl flex-col gap-4 text-[17px] leading-relaxed text-pretty text-muted-foreground [&_strong]:font-medium [&_strong]:text-foreground">
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
        intro="The crawler behind nvoke. Found it in your logs? Here is exactly what it did, and how to make it stop."
      />
      <Container className="pb-24 sm:pb-36">
        <dl className="mb-16 grid overflow-hidden rounded-2xl border bg-card shadow-sm sm:grid-cols-2 dark:bg-card/80">
          {FACTS.map((f, i) => (
            <div
              key={f.label}
              className={`flex flex-col gap-1.5 p-6 ${i > 0 ? 'border-t' : ''} ${i === 1 ? 'sm:border-t-0' : ''} ${i % 2 === 1 ? 'sm:border-l' : ''}`}
            >
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className={f.mono ? 'font-mono text-sm break-words' : 'text-[17px] font-medium tracking-[-0.01em]'}>
                {f.value}
              </dd>
            </div>
          ))}
        </dl>

        <Block title="Why it visited">
          <p>
            nvoke is a prospecting research tool. It helps businesses find other companies and the contact details those
            companies publish. A customer ran a search, and your company came up: listed on OpenStreetMap, in a web
            search, or launched on Product Hunt or Show HN. So nvokebot read your site for published contact details.
          </p>
          <p>
            It does not crawl the web at large. It only visits sites that came up in a customer search. For 90 days
            after a visit, other searches that find your company reuse the result. After that, the next search visits
            again and drops addresses that are gone.
          </p>
        </Block>

        <Block title="What it reads">
          <p>
            The home page and up to seven pages that usually hold contact details: contact, about, team, imprint
            (impressum), privacy and legal pages. It stops at eight pages or 2 MB per site, whichever comes first.
            Your blog is safe.
          </p>
          <p>
            From those pages it keeps <strong>email addresses</strong>, the URL where each one was found and when it was
            seen. The privacy policy explains what happens to them and how long they are kept.
          </p>
        </Block>

        <Block title="What it never does">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>Log in, create accounts or submit forms.</li>
            <li>Solve or get around CAPTCHAs, paywalls or other access controls.</li>
            <li>Fetch pages that robots.txt disallows.</li>
            <li>Send more than one request per second to your site, or more often than your Crawl-delay allows.</li>
            <li>Send email. The mailbox check talks to your mail server and stops before a message would be sent.</li>
          </ul>
        </Block>

        <Block title="Block it with robots.txt">
          <p>
            nvokebot reads your robots.txt first and checks every page against it. To keep it off your whole site:
          </p>
          <Code>{BLOCK_ALL}</Code>
          <p>To keep it out of certain folders:</p>
          <Code>{BLOCK_SOME}</Code>
          <p>
            A rule for <strong>User-agent: *</strong> applies to nvokebot too, unless there is a more specific nvokebot
            group. A <strong>Crawl-delay</strong> line slows it down further, up to one request
            every 10 seconds. If your robots.txt errors or times out, nvokebot fetches nothing else. Broken means no.
          </p>
        </Block>

        <Block title="Opt out your domain">
          <p>
            Enter your domain below. It works <strong>immediately</strong>, no confirmation: we delete every address we
            hold on the domain and its subdomains, remove them from customers’ results, and nvokebot stops visiting. We
            keep only a one-way hash of the domain so we can keep honouring it.
          </p>
          <OptOutForm defaultKind="domain" />
          <p>
            Just one email address? Same form, or the{' '}
            <Link href="/opt-out" className="text-foreground underline underline-offset-4">
              opt-out page
            </Link>
            . The{' '}
            <Link href="/privacy" className="text-foreground underline underline-offset-4">
              privacy policy
            </Link>{' '}
            explains your rights.
          </p>
        </Block>

        <Block title="Contact">
          <p>
            Crawler misbehaved on your site, or you have a question? Write to{' '}
            <a href={`mailto:${site.email.bot}`} className="text-foreground underline underline-offset-4">
              {site.email.bot}
            </a>
            . Requests about personal data go to{' '}
            <a href={`mailto:${site.email.privacy}`} className="text-foreground underline underline-offset-4">
              {site.email.privacy}
            </a>
            , and we answer within one month.
          </p>
        </Block>
      </Container>
    </>
  );
}
