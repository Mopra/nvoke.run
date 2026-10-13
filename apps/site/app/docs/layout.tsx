import type { ReactNode } from 'react';
import { DocsNav } from '@/components/docs/docs-nav';
import { Container } from '@/components/site/section';

export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <Container className="grid gap-8 pt-20 pb-24 sm:pt-28 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16 sm:pb-36">
      <DocsNav />
      <article className="min-w-0">{children}</article>
    </Container>
  );
}
