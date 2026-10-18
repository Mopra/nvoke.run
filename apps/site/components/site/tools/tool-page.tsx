import { Suspense, type ReactNode } from 'react';
import Link from 'next/link';
import { Faq } from '@/components/site/faq';
import { ChannelSteps, SheetClose, SheetHead, SheetSection, TermRows } from '@/components/docs/sheet';
import { Container } from '@/components/site/section';
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

/** The closing line on every tools page: one sentence and Start free. */
export function ToolsCtaBand({ campaign }: { campaign: ToolSlug | 'tools' }) {
  return (
    <SheetClose
      title="One check is a toy. A list is a pipeline."
      body={`Paste your site. nvoke finds the companies that buy from you, reads their websites, checks every address and drafts an opener for each. ${freeEmails} verified emails a month, free.`}
      action={
        <Button asChild size="lg">
          <Link href={signUpHref('tool_footer', campaign)}>Start free</Link>
        </Button>
      }
      note="In your browser. No card."
    />
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
    <Container>
      <JsonLd data={jsonLd} />
      <SheetHead
        crumbs={[{ label: 'Free tools', href: '/tools' }, { label: tool.name }]}
        title={title}
        intro={intro}
      >
        <div className="mt-3">
          <ToolsNav current={slug} />
        </div>
      </SheetHead>

      <div className="max-w-3xl pb-16 sm:pb-24">
        <Suspense fallback={<div className="plate h-[4.5rem]" aria-hidden="true" />}>{widget}</Suspense>
      </div>

      <SheetSection id="how-it-works" label="Method" title="How it works" intro={stepsIntro}>
        <ChannelSteps steps={steps} />
      </SheetSection>

      <SheetSection id="results" label="Glossary" title={termsTitle}>
        <div className="max-w-3xl">
          <TermRows rows={terms} />
        </div>
      </SheetSection>

      {children}

      <SheetSection id="faq" label="FAQ" title="Questions">
        <div className="max-w-3xl">
          <Faq items={faq} />
        </div>
      </SheetSection>

      <ToolsCtaBand campaign={slug} />
    </Container>
  );
}
