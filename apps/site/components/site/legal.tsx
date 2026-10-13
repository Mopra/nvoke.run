import type { ReactNode } from 'react';
import Link from 'next/link';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export type Lang = 'en' | 'da';

/** The same page in the other language, shown under the title. */
export type Alternate = { href: string; lang: Lang; label: string };

const UPDATED: Record<Lang, (date: string) => string> = {
  en: (date) => `Last updated ${date}.`,
  da: (date) => `Senest opdateret ${date}.`,
};

/** Link to the same page in the other language. */
export function LanguageLink({ alternate }: { alternate: Alternate }) {
  return (
    <Link
      href={alternate.href}
      hrefLang={alternate.lang}
      lang={alternate.lang}
      className="rounded-full bg-foreground/[0.05] px-3 py-1 text-[13px] text-foreground/80 outline-none transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      {alternate.label}
    </Link>
  );
}

export function LegalPage({
  title,
  updated,
  lang = 'en',
  alternate,
  children,
}: {
  title: string;
  updated: string;
  lang?: Lang;
  alternate?: Alternate;
  children: ReactNode;
}) {
  return (
    // The root layout says lang="en"; the Danish pages override it here.
    <div lang={lang}>
      <PageHeader title={title} intro={UPDATED[lang](updated)}>
        {alternate ? <LanguageLink alternate={alternate} /> : null}
      </PageHeader>
      <Container className="pb-24 sm:pb-36">
        <div className="mx-auto flex max-w-2xl flex-col gap-12 text-[17px] text-pretty leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.025em] [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </Container>
    </div>
  );
}

/** Company line for the legal pages. Omits details that are not filled in yet. */
export function CompanyLine({ lang = 'en' }: { lang?: Lang }) {
  const { legalName, cvr, address, country } = site.company;
  return (
    <>
      <strong>{legalName}</strong>
      {cvr ? `, CVR ${cvr}` : null}
      {address ? `, ${address}` : null}, {lang === 'da' && country === 'Denmark' ? 'Danmark' : country}
    </>
  );
}
