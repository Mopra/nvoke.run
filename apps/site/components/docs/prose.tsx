import type { ReactNode } from 'react';
import Link from 'next/link';
import { RevealHeading } from '@/components/site/home/reveal';
import { cn } from '@/lib/utils';

/** Page title block for a docs page: a printed label, a light title that rises in, a short lede. */
export function DocsTitle({ title, intro, eyebrow = 'Docs' }: { title: string; intro: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-col gap-5 pb-14">
      <p className="cap text-muted-foreground">{eyebrow}</p>
      <RevealHeading as="h1" className="text-display font-light text-balance" lines={[title]} />
      <p className="max-w-2xl text-[17px] leading-relaxed text-pretty text-muted-foreground">{intro}</p>
    </header>
  );
}

/** A docs section with an anchor. `channel` prints its number (01, 02) before the title. */
export function DocsSection({
  id,
  title,
  channel,
  children,
}: {
  id?: string;
  title: string;
  channel?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-28 flex-col gap-5 border-t py-12">
      <h2 className="flex items-baseline gap-4 text-[28px] leading-tight font-light tracking-[-0.03em] text-balance">
        {channel ? <span className="cap shrink-0 text-muted-foreground">{channel}</span> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Inline code: a small recessed chip in the mono. */
export const INLINE_CODE = 'rounded-[3px] bg-foreground/[0.07] px-1.5 py-0.5 font-mono text-[13px] text-foreground';

/** Running text with inline code and links styled. */
export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex max-w-2xl flex-col gap-4 text-[16px] leading-relaxed text-pretty text-muted-foreground',
        '[&_strong]:font-medium [&_strong]:text-foreground',
        '[&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:decoration-2',
        '[&_code]:rounded-[3px] [&_code]:bg-foreground/[0.07] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-foreground',
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
          <code key={i} className={INLINE_CODE}>
            {p.slice(1, -1)}
          </code>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** A list of links or items as hairline rows with channel numbers. */
export function ChannelRows({
  items,
  className,
}: {
  items: { key: string; title: ReactNode; body?: ReactNode; href?: string }[];
  className?: string;
}) {
  return (
    <ol className={cn('border-b', className)}>
      {items.map((item, i) => {
        const inner = (
          <>
            <span className="cap pt-1 text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-[17px] text-foreground">{item.title}</span>
              {item.body ? <span className="text-[15px] text-pretty text-muted-foreground">{item.body}</span> : null}
            </span>
          </>
        );
        const row = 'grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 border-t py-4';
        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className={cn(row, 'outline-none transition-colors hover:bg-foreground/[0.035] focus-visible:ring-[3px] focus-visible:ring-ring/40')}
              >
                {inner}
              </Link>
            ) : (
              <div className={row}>{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Key facts as hairline rows: a printed label, then the value. */
export function Facts({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="border-b text-sm">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-1 border-t py-3 sm:grid-cols-[8rem_1fr]">
          <dt className="cap text-muted-foreground">{row.label}</dt>
          <dd className="min-w-0">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
