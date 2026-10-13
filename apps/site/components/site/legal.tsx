import type { ReactNode } from 'react';
import { Container, PageHeader } from '@/components/site/section';
import { site } from '@/lib/site';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <>
      <PageHeader title={title} intro={`Last updated ${updated}.`} />
      <Container className="pb-20 sm:pb-28">
        <div className="flex max-w-2xl flex-col gap-10 text-pretty leading-relaxed text-muted-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_p+p]:mt-3 [&_ul+p]:mt-3 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:mt-3 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
          {children}
        </div>
      </Container>
    </>
  );
}

/** Company line for the legal pages. Omits details that are not filled in yet. */
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
