import type { ReactNode } from 'react';
import { RevealHeading } from '@/components/site/home/reveal';
import { Container } from '@/components/site/section';
import { site } from '@/lib/site';

/** A legal page: a printed date, a title that rises in, then the sections at a reading measure, divided by hairlines. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <Container className="pb-24 sm:pb-36">
      <header className="flex flex-col items-start pt-20 pb-14 sm:pt-32 sm:pb-20">
        <p className="cap text-muted-foreground">Legal &#183; Updated {updated}</p>
        <RevealHeading as="h1" className="mt-6 text-display font-light" lines={[title]} />
      </header>
      <div className="flex max-w-[68ch] flex-col text-[16px] leading-relaxed text-pretty text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:decoration-foreground/30 [&_a]:underline-offset-4 [&_a:hover]:decoration-foreground [&_h2]:mb-6 [&_h2]:text-title [&_h2]:font-light [&_h2]:text-foreground [&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:font-mono [&_h3]:text-[11.5px] [&_h3]:font-medium [&_h3]:tracking-[0.07em] [&_h3]:text-foreground [&_h3]:uppercase [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:marker:text-muted-foreground/60 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&>section]:scroll-mt-28 [&>section]:border-t [&>section]:py-12 sm:[&>section]:py-16">
        {children}
      </div>
    </Container>
  );
}

/** Operator line for the legal pages. Omits details that are not filled in yet. */
export function CompanyLine() {
  const { legalName, cvr, address, country } = site.company;
  return (
    <>
      <strong>{legalName}</strong>
      {cvr ? `, CVR ${cvr}` : null}
      {address ? `, ${address}` : null}, {country}
    </>
  );
}
