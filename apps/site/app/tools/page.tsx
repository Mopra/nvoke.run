import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container } from '@/components/site/section';
import { AuthDemo, ExtractDemo, VerifyDemo } from '@/components/site/tools/displays';
import { JsonLd } from '@/components/site/tools/json-ld';
import { SplitSection, ToolsCtaBand, type ToolFaq } from '@/components/site/tools/tool-page';
import { Faq } from '@/components/site/faq';
import { site } from '@/lib/site';
import { toolBySlug, tools, toolOpenGraph, type ToolSlug } from '@/lib/tools';

const description =
  'Free email tools from nvoke: verify an email address with its mail server, find the emails on a company website, and check SPF, DMARC and DKIM. No sign-up.';

export const metadata: Metadata = {
  title: 'Free email tools: verifier, extractor, SPF and DMARC checker',
  description,
  alternates: { canonical: '/tools' },
  openGraph: toolOpenGraph('Free email tools', description, '/tools'),
};

const DEMOS: Record<ToolSlug, ReactNode> = {
  'email-verifier': <VerifyDemo compact />,
  'website-email-extractor': <ExtractDemo compact />,
  'spf-dmarc-checker': <AuthDemo compact />,
};

/** Start from the problem, not the tool. */
const PROBLEMS: { symptom: string; why: string; tool: ToolSlug }[] = [
  {
    symptom: 'Your emails bounce',
    why: 'The address may be gone. Ask its mail server first.',
    tool: 'email-verifier',
  },
  {
    symptom: 'You guessed firstname@company.com',
    why: 'Guesses bounce and burn your domain. Check it first.',
    tool: 'email-verifier',
  },
  {
    symptom: 'You have a company, not a contact',
    why: 'Most publish an address somewhere. We read where it hides.',
    tool: 'website-email-extractor',
  },
  {
    symptom: 'The contact page is a form',
    why: 'The imprint, privacy or team page often lists one anyway.',
    tool: 'website-email-extractor',
  },
  {
    symptom: 'Your mail lands in spam',
    why: 'Weak SPF, DKIM or DMARC. Gmail and Yahoo demand all three.',
    tool: 'spf-dmarc-checker',
  },
  {
    symptom: 'You set up a new sending domain',
    why: 'Check before the first send, not after a hundred land in spam.',
    tool: 'spf-dmarc-checker',
  },
];

const ENGINE = [
  { title: 'Asks, never guesses', body: 'Verdicts come from the mail server. When it will not answer, we say so.' },
  { title: 'Polite crawler', body: 'robots.txt first, one page a second, eight pages a site at most.' },
  { title: 'Nothing gets sent', body: 'No test email, no tracking pixel. nvoke has no send button.' },
];

const FAQ: ToolFaq[] = [
  {
    q: 'Are the tools really free?',
    a: 'Yes. No account, no card, no email gate. Each network gets a few checks an hour and there is a daily cap for everyone, because every check costs us real mail server and crawler time.',
  },
  {
    q: 'What is the catch?',
    a: 'There is none hidden. The tools are a sample of what nvoke does at scale: find companies, read their websites and check every address. If you need that for hundreds of companies, sign up.',
  },
  {
    q: 'Do the tools send any email?',
    a: 'No. The verifier talks to the mail server and hangs up before a message would be sent. nvoke has no send button at all.',
  },
  {
    q: 'Can I use them from a script or an agent?',
    a: 'Use the nvoke API instead. It does everything the app does with an API key, and agents get an MCP server. The docs are at nvoke.run/docs.',
  },
];

export default function ToolsPage() {
  const indexUrl = new URL('/tools', site.url).toString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${indexUrl}#page`,
        url: indexUrl,
        name: 'Free email tools',
        description,
        isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: tools.map((t, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: t.name,
            description: t.description,
            url: new URL(t.href, site.url).toString(),
          })),
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <section className="pt-16 pb-20 sm:pt-28 sm:pb-28">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <p className="cap text-primary">Free &#183; No sign-up</p>
            <RevealHeading as="h1" className="mt-6 text-display font-light" lines={['Free email tools.']} />
            <p className="mt-6 max-w-lg text-lede text-pretty text-muted-foreground">
              Check an address. Find a site’s emails. Fix what sends you to spam. On the engine that runs nvoke.
            </p>
          </div>

          <ol className="mt-16 grid gap-x-8 gap-y-16 sm:mt-24 md:grid-cols-3">
            {tools.map((tool, i) => (
              <li key={tool.slug}>
                <Link
                  href={tool.href}
                  className="group flex h-full flex-col outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <div className="transition-transform duration-300 ease-out-soft group-hover:-translate-y-1 motion-reduce:transform-none">
                    {DEMOS[tool.slug]}
                  </div>
                  <span className="mt-8 flex items-center gap-2.5 border-t pt-5">
                    <span aria-hidden="true" className="led group-hover:led-on" />
                    <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                  </span>
                  <h2 className="mt-4 text-title font-light text-balance">{tool.name}</h2>
                  <p className="mt-2 mb-6 text-[15px] text-pretty text-muted-foreground">{tool.description}</p>
                  <span className="key mt-auto inline-flex h-10 w-fit items-center bg-secondary px-5 font-mono text-[12.5px] font-medium tracking-[0.07em] text-secondary-foreground uppercase">
                    Open
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <SplitSection id="problems" title="Start from the symptom.">
        <ul className="border-b">
          {PROBLEMS.map((p) => {
            const tool = toolBySlug(p.tool);
            return (
              <li key={p.symptom} className="border-t">
                <Link
                  href={tool.href}
                  className="group grid gap-1.5 py-5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-8"
                >
                  <span className="flex flex-col gap-1">
                    <span className="text-[19px] font-light tracking-[-0.01em] text-pretty">{p.symptom}</span>
                    <span className="text-[15px] text-pretty text-muted-foreground">{p.why}</span>
                  </span>
                  <span className="cap inline-flex items-center gap-2 whitespace-nowrap text-muted-foreground transition-colors group-hover:text-foreground">
                    <span aria-hidden="true" className="led group-hover:led-on" />
                    {tool.short}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </SplitSection>

      <section id="why" aria-labelledby="why-title" className="py-20 sm:py-28">
        <Container>
          <RevealHeading id="why-title" className="text-headline font-light" lines={['Not demo toys.']} />
          <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">
            The verifier and crawler nvoke customers use, with the same rules.
          </p>
          <ol className="mt-14 grid gap-x-10 gap-y-12 sm:mt-20 md:grid-cols-3">
            {ENGINE.map((e, i) => (
              <li key={e.title} className="border-t pt-6">
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="led led-on" />
                  <span className="cap text-muted-foreground tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <h3 className="mt-8 text-title font-light">{e.title}</h3>
                <p className="mt-3 max-w-xs text-[15px] text-pretty text-muted-foreground">{e.body}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      <SplitSection id="faq" title="Questions.">
        <Faq items={FAQ} />
      </SplitSection>

      <ToolsCtaBand campaign="tools" />
    </>
  );
}
