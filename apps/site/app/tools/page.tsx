import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, AtSign, Globe, ShieldCheck } from 'lucide-react';
import { Faq } from '@/components/site/faq';
import { ChannelSteps, SheetHead, SheetSection } from '@/components/docs/sheet';
import { Container } from '@/components/site/section';
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
    <Container>
      <JsonLd data={jsonLd} />
      <SheetHead
        eyebrow="Free tools"
        title="Free email tools"
        intro="Check an address, find the emails on a website, fix the records that send you to spam. No sign-up. The same engine that runs nvoke."
      />

      <ol className="mb-16 grid border-b md:grid-cols-3 md:gap-x-8 md:border-b-0 sm:mb-24">
        {tools.map((tool, i) => {
          const Icon = ICONS[tool.slug];
          return (
            <li key={tool.slug} className="md:border-b">
              <Link
                href={tool.href}
                className="group flex h-full flex-col gap-3 border-t py-6 outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <span className="flex items-center justify-between">
                  <span className="cap text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                  <Icon className="size-5 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <h2 className="mt-2 text-[28px] leading-tight font-light tracking-[-0.03em] text-balance">{tool.name}</h2>
                <p className="text-[15px] text-pretty text-muted-foreground">{tool.description}</p>
                <span className="cap mt-auto inline-flex items-center gap-1.5 pt-3 text-foreground">
                  Open
                  <ArrowRight
                    className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      <SheetSection
        id="problems"
        label="Symptoms"
        title="Start from the problem"
        intro="You rarely need a tool. You need a symptom gone. Find yours."
      >
        <table className="w-full max-w-4xl text-left">
          <caption className="sr-only">Symptoms and the tool that fixes each</caption>
          <thead className="sr-only sm:not-sr-only">
            <tr className="cap text-muted-foreground">
              <th scope="col" className="pb-3 font-medium">
                If
              </th>
              <th scope="col" className="hidden pb-3 font-medium md:table-cell">
                Why
              </th>
              <th scope="col" className="pb-3 text-right font-medium">
                Use
              </th>
            </tr>
          </thead>
          <tbody className="divide-y border-y">
            {PROBLEMS.map((p) => {
              const tool = toolBySlug(p.tool);
              return (
                <tr key={p.symptom} className="align-top">
                  <th scope="row" className="py-5 pr-6 text-[17px] font-normal tracking-[-0.01em]">
                    {p.symptom}
                    <p className="mt-1.5 text-[15px] text-pretty text-muted-foreground md:hidden">{p.why}</p>
                  </th>
                  <td className="hidden py-5 pr-6 text-[15px] text-pretty text-muted-foreground md:table-cell">{p.why}</td>
                  <td className="py-5 text-right">
                    <Link
                      href={tool.href}
                      className="cap inline-flex items-center gap-1 whitespace-nowrap text-foreground underline-offset-4 hover:underline"
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
      </SheetSection>

      <SheetSection
        id="why"
        label="Engine"
        title="Built on the real engine"
        intro="Not demo toys. Every check runs on the verifier and crawler nvoke customers use, with the same rules."
      >
        <ChannelSteps
          steps={[
            { title: 'Asks, never guesses', body: 'Verdicts come from the mail server. When it will not answer, we say so.' },
            { title: 'Polite crawler', body: 'nvokebot reads robots.txt first, one page a second, at most eight pages a site.' },
            { title: 'Nothing gets sent', body: 'No test email, no tracking pixel. nvoke has no send button anywhere.' },
          ]}
        />
      </SheetSection>

      <SheetSection id="faq" label="FAQ" title="Questions">
        <div className="max-w-3xl">
          <Faq items={FAQ} />
        </div>
      </SheetSection>

      <ToolsCtaBand campaign="tools" />
    </Container>
  );
}
