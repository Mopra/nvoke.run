import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { Faq } from '@/components/site/faq';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';
import { signUpHref, toolBySlug, type ToolSlug } from '@/lib/tools';
import { JsonLd } from './json-ld';
import { ToolSteps, type ToolStep } from './steps';
import { ToolsNav } from './tools-nav';

export type { ToolStep };
export type ToolFaq = { q: string; a: string };
export type ToolTerm = { term: ReactNode; meaning: string };

const freeEmails = formatCount(pricing.free.emailsPerMonth);

/** The last call on every tools page, centered like the homepage's: a line, one key. */
export function ToolsCtaBand({ campaign }: { campaign: ToolSlug | 'tools' }) {
  return (
    <section aria-labelledby="tools-cta-title" className="py-24 sm:py-36">
      <Container className="flex flex-col items-center text-center">
        <RevealHeading
          id="tools-cta-title"
          className="max-w-4xl text-display font-light"
          lines={['One check is a toy.', 'A list is a pipeline.']}
        />
        <p className="mt-6 max-w-md text-lede text-pretty text-muted-foreground">
          nvoke finds the companies, reads their sites and checks every address.
        </p>
        <Button asChild size="xl" variant="dark" className="mt-10">
          <Link href={signUpHref('tool_footer', campaign)}>Start free</Link>
        </Button>
        <p className="cap mt-6 text-muted-foreground">{freeEmails} verified emails a month, free</p>
      </Container>
    </section>
  );
}

/** A heading on the left, the rows on the right: the glossary and the questions. */
export function SplitSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 py-20 sm:py-28">
      <Container className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <RevealHeading id={`${id}-title`} className="text-headline font-light" lines={[title]} />
        <div>{children}</div>
      </Container>
    </section>
  );
}

/**
 * The shell of a tool page: the title, the tool on its screen, how it works,
 * the glossary, the questions, the last call and JSON-LD.
 */
export function ToolPage({
  slug,
  title,
  intro,
  widget,
  steps,
  stepsIntro,
  terms,
  termsTitle,
  faq,
  children,
}: {
  slug: ToolSlug;
  title: string;
  intro: string;
  widget: ReactNode;
  steps: ToolStep[];
  stepsIntro: string;
  terms: ToolTerm[];
  termsTitle: string;
  faq: ToolFaq[];
  /** Extra sections between the glossary and the FAQ. */
  children?: ReactNode;
}) {
  const tool = toolBySlug(slug);
  const url = new URL(tool.href, site.url).toString();
  const toolsUrl = new URL('/tools', site.url).toString();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': `${url}#page`,
        url,
        name: title,
        description: intro,
        isPartOf: { '@type': 'WebSite', name: site.name, url: site.url },
        breadcrumb: {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Tools', item: toolsUrl },
            { '@type': 'ListItem', position: 2, name: tool.name, item: url },
          ],
        },
      },
      {
        '@type': 'SoftwareApplication',
        name: `${site.name} ${tool.name}`,
        url,
        description: tool.description,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        publisher: { '@type': 'Organization', name: site.name, url: site.url },
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
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
            <nav aria-label="Breadcrumb">
              <ol className="cap flex flex-wrap items-center justify-center gap-2 text-muted-foreground">
                <li>
                  <Link href="/tools" className="underline-offset-4 hover:text-foreground hover:underline">
                    Free tools
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-primary">
                  {tool.name}
                </li>
              </ol>
            </nav>
            <RevealHeading as="h1" className="mt-6 text-display font-light text-balance" lines={[title]} />
            <p className="mt-6 max-w-xl text-lede text-pretty text-muted-foreground">{intro}</p>
          </div>
          <div className="mx-auto mt-14 max-w-3xl sm:mt-20">
            <Suspense fallback={<div className="h-[30rem]" aria-hidden="true" />}>{widget}</Suspense>
          </div>
          <div className="mt-16 flex flex-col items-center gap-4">
            <span className="cap text-muted-foreground">More free tools</span>
            <ToolsNav current={slug} className="justify-center" />
          </div>
        </Container>
      </section>

      <section id="how-it-works" aria-labelledby="how-it-works-title" className="scroll-mt-28 py-20 sm:py-28">
        <Container>
          <RevealHeading id="how-it-works-title" className="text-headline font-light" lines={['How it works.']} />
          <p className="mt-5 max-w-md text-lede text-pretty text-muted-foreground">{stepsIntro}</p>
          <ToolSteps steps={steps} />
        </Container>
      </section>

      <SplitSection id="results" title={termsTitle}>
        <dl className="border-b">
          {terms.map((t, i) => (
            <div key={i} className="grid gap-2 border-t py-5 sm:grid-cols-[13rem_1fr] sm:gap-8">
              <dt className="text-[16px] text-foreground">{t.term}</dt>
              <dd className="text-[15px] text-pretty text-muted-foreground">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </SplitSection>

      {children}

      <SplitSection id="faq" title="Questions.">
        <Faq items={faq} />
      </SplitSection>

      <ToolsCtaBand campaign={slug} />
    </>
  );
}
