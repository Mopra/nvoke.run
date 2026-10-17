import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, AtSign, Globe, ShieldCheck } from 'lucide-react';
import { Faq } from '@/components/site/faq';
import { Container, PageHeader, Section } from '@/components/site/section';
import { JsonLd } from '@/components/site/tools/json-ld';
import { ToolsCtaBand, type ToolFaq } from '@/components/site/tools/tool-page';
import { site } from '@/lib/site';
import { toolBySlug, toolOpenGraph, tools, type ToolSlug } from '@/lib/tools';

const description =
  'Free email tools from nvoke: verify an email address with its mail server, find the emails on a company website, and check SPF, DMARC and DKIM. No sign-up.';

export const metadata: Metadata = {
  title: 'Free email tools: verifier, extractor, SPF and DMARC checker',
  description,
  alternates: { canonical: '/tools' },
  openGraph: toolOpenGraph('Free email tools', description, '/tools'),
};

const ICONS: Record<ToolSlug, typeof AtSign> = {
  'email-verifier': AtSign,
  'website-email-extractor': Globe,
  'spf-dmarc-checker': ShieldCheck,
};

/** Start from the problem, not the tool. */
const PROBLEMS: { symptom: string; why: string; tool: ToolSlug }[] = [
  {
    symptom: 'Your emails bounce',
    why: 'The address may not exist anymore. Ask its mail server before you send again.',
    tool: 'email-verifier',
  },
  {
    symptom: 'You guessed firstname@company.com',
    why: 'Guesses bounce and burn your domain. Check the guess, or find what the company really publishes.',
    tool: 'email-verifier',
  },
  {
    symptom: 'You have a company, not a contact',
    why: 'Most companies publish an address somewhere on their site. We read the pages where it hides.',
    tool: 'website-email-extractor',
  },
  {
    symptom: 'The contact page is a form',
    why: 'The imprint, privacy policy or team page often still lists an address.',
    tool: 'website-email-extractor',
  },
  {
    symptom: 'Your mail lands in spam',
    why: 'Missing or weak SPF, DKIM or DMARC is the usual cause. Gmail and Yahoo require all three from bulk senders.',
    tool: 'spf-dmarc-checker',
  },
  {
    symptom: 'You just set up a new sending domain',
    why: 'Check the records before the first message, not after the first hundred go to spam.',
    tool: 'spf-dmarc-checker',
  },
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
      <PageHeader
        title="Free email tools"
        intro="Check an address, find the emails on a website, fix the records that send you to spam. No sign-up. The same engine that runs nvoke."
      />

      <Container className="pb-24 sm:pb-36">
        <ul className="grid gap-5 md:grid-cols-3">
          {tools.map((tool) => {
            const Icon = ICONS[tool.slug];
            return (
              <li key={tool.slug}>
                <Link
                  href={tool.href}
                  className="glass group flex h-full flex-col gap-5 rounded-[28px] p-7 outline-none transition-transform duration-200 hover:-translate-y-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-8"
                >
                  <Icon className="size-7 text-muted-foreground/70" strokeWidth={1.25} aria-hidden="true" />
                  <h2 className="mt-4 font-display text-2xl font-semibold tracking-[-0.025em] text-balance">
                    {tool.name}
                  </h2>
                  <p className="text-pretty text-muted-foreground">{tool.description}</p>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium">
                    Open
                    <ArrowRight
                      className="size-4 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Container>

      <Section
        id="problems"
        title="Start from the problem"
        intro="You rarely need a tool. You need a symptom gone. Find yours."
        className="pt-0 sm:pt-0"
      >
        <div className="mx-auto max-w-3xl">
          <table className="w-full text-left">
            <caption className="sr-only">Symptoms and the tool that fixes each</caption>
            <thead className="sr-only sm:not-sr-only">
              <tr className="text-sm text-muted-foreground">
                <th scope="col" className="pb-4 font-normal">
                  If
                </th>
                <th scope="col" className="hidden pb-4 font-normal md:table-cell">
                  Why
                </th>
                <th scope="col" className="pb-4 text-right font-normal">
                  Use
                </th>
              </tr>
            </thead>
            <tbody className="divide-y border-y">
              {PROBLEMS.map((p) => {
                const tool = toolBySlug(p.tool);
                return (
                  <tr key={p.symptom} className="align-top">
                    <th scope="row" className="py-6 pr-6 font-display text-lg font-medium tracking-[-0.015em]">
                      {p.symptom}
                      <p className="mt-1.5 font-sans text-[15px] font-normal tracking-normal text-pretty text-muted-foreground md:hidden">
                        {p.why}
                      </p>
                    </th>
                    <td className="hidden py-6 pr-6 text-pretty text-muted-foreground md:table-cell">{p.why}</td>
                    <td className="py-6 text-right">
                      <Link
                        href={tool.href}
                        className="inline-flex items-center gap-1 rounded-full text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline"
                      >
                        {tool.short}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        id="why"
        title="Built on the real engine"
        intro="These are not demo toys. Every check runs on the same verifier and crawler that nvoke customers use, with the same rules."
        className="pt-0 sm:pt-0"
      >
        <dl className="grid gap-12 sm:grid-cols-3">
          <div className="flex flex-col gap-2.5">
            <dt className="font-display text-lg font-semibold tracking-[-0.015em]">Asks, never guesses</dt>
            <dd className="text-pretty text-muted-foreground">
              Verdicts come from the mail server. When it will not answer, we say so.
            </dd>
          </div>
          <div className="flex flex-col gap-2.5">
            <dt className="font-display text-lg font-semibold tracking-[-0.015em]">Polite crawler</dt>
            <dd className="text-pretty text-muted-foreground">
              nvokebot reads robots.txt first, one page a second, at most eight pages a site.
            </dd>
          </div>
          <div className="flex flex-col gap-2.5">
            <dt className="font-display text-lg font-semibold tracking-[-0.015em]">Nothing gets sent</dt>
            <dd className="text-pretty text-muted-foreground">
              No test email, no tracking pixel. nvoke has no send button anywhere.
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="faq" title="Questions" className="pt-0 sm:pt-0">
        <div className="mx-auto max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </Section>

      <ToolsCtaBand campaign="tools" />
    </>
  );
}
