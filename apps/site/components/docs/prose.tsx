import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Page title block for a docs page. */
export function DocsTitle({ title, intro }: { title: string; intro: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 pb-12">
      <h1 className="text-4xl font-semibold tracking-[-0.04em] text-balance sm:text-5xl">{title}</h1>
      <p className="max-w-2xl text-lg leading-relaxed text-pretty text-muted-foreground">{intro}</p>
    </header>
  );
}

/** A docs section with an anchor. */
export function DocsSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-5 border-t py-12">
      <h2 className="text-2xl font-semibold tracking-[-0.025em] text-balance">{title}</h2>
      {children}
    </section>
  );
}

/** Running text with inline code and links styled. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex max-w-2xl flex-col gap-4 text-[16px] leading-relaxed text-pretty text-muted-foreground',
        '[&_strong]:font-medium [&_strong]:text-foreground',
        '[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4',
        '[&_code]:rounded-md [&_code]:bg-foreground/[0.06] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Renders `code` spans in catalog text (backticks) as inline code. */
export function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') ? (
          <code key={i} className="rounded-md bg-foreground/[0.06] px-1.5 py-0.5 font-mono text-[13px] text-foreground">
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}
