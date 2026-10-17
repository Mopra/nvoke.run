import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Faq } from '@/components/site/faq';
import { Container, Section } from '@/components/site/section';
import { Button } from '@/components/ui/button';
import { formatCount, pricing } from '@/lib/pricing';
import { site } from '@/lib/site';
import { signUpHref, toolBySlug, type ToolSlug } from '@/lib/tools';
import { JsonLd } from './json-ld';
import { ToolsNav } from './tools-nav';

export type ToolFaq = { q: string; a: string };
export type ToolStep = { title: string; body: string };
export type ToolTerm = { term: ReactNode; meaning: string };

const freeEmails = formatCount(pricing.free.emailsPerMonth);

/** The closing band on every tools page: one big line and Start free. */
export function ToolsCtaBand({ campaign }: { campaign: ToolSlug | 'tools' }) {
  return (
    <section className="relative overflow-hidden py-28 sm:py-44">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[34rem] w-[60rem] max-w-[160vw] -translate-x-1/2 -translate-y-1/2"
      >
        <div className="aura absolute inset-0 rounded-full motion-safe:animate-breathe" />
      </div>
      <Container className="relative flex flex-col items-center gap-6 text-center">
        <h2 className="max-w-4xl text-headline font-semibold text-balance">One check is a toy. A list is a pipeline.</h2>
        <p className="max-w-xl text-lede text-pretty text-muted-foreground">
          Paste your site. nvoke finds the companies that buy from you, reads their websites, checks every address and
          drafts an opener for each. {freeEmails} verified emails a month, free.
        </p>
        <div className="mt-6 flex flex-col items-center gap-5">
          <Button asChild size="xl">
            <Link href={signUpHref('tool_footer', campaign)}>Start free</Link>
          </Button>
          <p className="text-sm text-muted-foreground">In your browser. No card.</p>
        </div>
      </Container>
    </section>
  );
}

/**
 * The shell of a tool page: breadcrumb, label, title, the tool links, the
 * widget, then the explainer sections, FAQ, closing band and JSON-LD.
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
      <section className="relative -mt-20 overflow-hidden pt-36 sm:pt-44">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-1/2 h-[40rem] w-[70rem] max-w-[180vw] -translate-x-1/2 -translate-y-1/3"
        >
          <div className="aura absolute inset-0 rounded-full opacity-80" />
        </div>
        <Container className="relative flex flex-col items-center text-center">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <li>
                <Link href="/tools" className="rounded-full hover:text-foreground">
                  Tools
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5 opacity-60" />
              </li>
              <li aria-current="page" className="text-foreground/80">
                {tool.name}
              </li>
            </ol>
          </nav>
          <p className="mt-10 inline-flex h-7 items-center rounded-full bg-foreground/[0.06] px-3 text-xs font-medium text-muted-foreground">
            Free tool
          </p>
          <h1 className="mt-6 max-w-4xl text-headline font-semibold text-balance">{title}</h1>
          <p className="mt-6 max-w-2xl text-lede text-pretty text-muted-foreground">{intro}</p>
          <div className="mt-10">
            <ToolsNav current={slug} />
          </div>
        </Container>
        <Container className="relative mt-12 pb-8 sm:mt-16">
          <div className="mx-auto max-w-3xl">
            <Suspense fallback={<div className="h-[4.5rem] rounded-full glass-strong" aria-hidden="true" />}>
              {widget}
            </Suspense>
          </div>
        </Container>
      </section>

      <Section id="how-it-works" title="How it works" intro={stepsIntro}>
        <ol className="grid gap-14 md:grid-cols-3 md:gap-12">
          {steps.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span className="font-display text-5xl font-extralight text-muted-foreground/60 tabular-nums">
                {i + 1}
              </span>
              <h3 className="mt-2 font-display text-2xl font-semibold tracking-[-0.025em] text-balance">
                {step.title}
              </h3>
              <p className="text-pretty text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="results" title={termsTitle} className="pt-0 sm:pt-0">
        <dl className="mx-auto flex max-w-3xl flex-col divide-y">
          {terms.map((t, i) => (
            <div key={i} className="grid gap-2 py-6 sm:grid-cols-[13rem_1fr] sm:gap-8">
              <dt className="font-medium">{t.term}</dt>
              <dd className="text-pretty text-muted-foreground">{t.meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>

      {children}

      <Section id="faq" title="Questions" className="pt-0 sm:pt-0">
        <div className="mx-auto max-w-3xl">
          <Faq items={faq} />
        </div>
      </Section>

      <ToolsCtaBand campaign={slug} />
    </>
  );
}
