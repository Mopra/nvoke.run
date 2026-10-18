import type { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/*
 * The secondary pages read like a product sheet: a printed label, a light
 * title, then sections divided by hairlines. Used by the tools, the vs
 * pages, agents, the bot page and the legal pages.
 */

/** The title block of a secondary page: crumbs or a label, a light title, the lede. */
export function SheetHead({
  eyebrow,
  crumbs,
  title,
  intro,
  children,
  className,
}: {
  /** A printed label above the title. Ignored when crumbs are given. */
  eyebrow?: ReactNode;
  /** Breadcrumb trail; the last item is the current page. */
  crumbs?: { label: string; href?: string }[];
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('flex flex-col gap-5 pt-20 pb-12 sm:pt-28 sm:pb-16', className)}>
      {crumbs ? (
        <nav aria-label="Breadcrumb">
          <ol className="cap flex flex-wrap items-center gap-2 text-muted-foreground">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <li key={c.label} className="flex items-center gap-2">
                  {c.href && !last ? (
                    <Link href={c.href} className="underline-offset-4 hover:text-foreground hover:underline">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={last ? 'text-foreground' : undefined}>
                      {c.label}
                    </span>
                  )}
                  {last ? null : <span aria-hidden="true">/</span>}
                </li>
              );
            })}
          </ol>
        </nav>
      ) : eyebrow ? (
        <p className="cap text-muted-foreground">{eyebrow}</p>
      ) : null}
      <h1 className="max-w-4xl text-[44px] leading-[1.02] font-light tracking-[-0.045em] text-balance sm:text-[64px]">
        {title}
      </h1>
      {intro ? <p className="max-w-2xl text-[17px] leading-relaxed text-pretty text-muted-foreground">{intro}</p> : null}
      {children}
    </header>
  );
}

/** A section of a sheet: a hairline on top, a printed label or channel, a light title. */
export function SheetSection({
  id,
  label,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  label?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn('scroll-mt-28 border-t py-14 sm:py-20', className)}>
      <div className="flex max-w-3xl flex-col gap-4">
        {label ? <p className="cap text-muted-foreground">{label}</p> : null}
        <h2 id={headingId} className="text-[34px] leading-[1.08] font-light tracking-[-0.035em] text-balance sm:text-[44px]">
          {title}
        </h2>
        {intro ? <p className="max-w-2xl text-[16px] leading-relaxed text-pretty text-muted-foreground">{intro}</p> : null}
      </div>
      {children ? <div className="mt-10 sm:mt-12">{children}</div> : null}
    </section>
  );
}

/** Ordered steps as hairline rows with channel numbers, side by side on wide screens. */
export function ChannelSteps({ steps, columns = 3 }: { steps: { title: string; body: ReactNode }[]; columns?: 2 | 3 | 4 }) {
  return (
    <ol
      className={cn(
        'grid gap-x-8',
        columns === 2 && 'md:grid-cols-2',
        columns === 3 && 'md:grid-cols-3',
        columns === 4 && 'md:grid-cols-2 lg:grid-cols-4',
      )}
    >
      {steps.map((step, i) => (
        <li key={step.title} className="flex flex-col gap-2 border-t py-5">
          <span className="cap text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
          <h3 className="text-[21px] leading-tight font-light tracking-[-0.02em] text-balance">{step.title}</h3>
          <p className="text-[15px] text-pretty text-muted-foreground">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}

/** Terms and their meaning as hairline rows. */
export function TermRows({ rows }: { rows: { term: ReactNode; meaning: ReactNode }[] }) {
  return (
    <dl className="border-b">
      {rows.map((t, i) => (
        <div key={i} className="grid gap-2 border-t py-5 sm:grid-cols-[14rem_1fr] sm:gap-8">
          <dt className="text-[16px] text-foreground">{t.term}</dt>
          <dd className="text-[15px] text-pretty text-muted-foreground">{t.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The closing line of a page: a light title, a sentence, one key. */
export function SheetClose({
  title,
  body,
  action,
  note,
}: {
  title: ReactNode;
  body?: ReactNode;
  action: ReactNode;
  note?: ReactNode;
}) {
  return (
    <section className="border-t py-20 sm:py-28">
      <div className="flex max-w-3xl flex-col items-start gap-5">
        <h2 className="text-[34px] leading-[1.08] font-light tracking-[-0.035em] text-balance sm:text-[44px]">{title}</h2>
        {body ? <p className="max-w-xl text-[16px] leading-relaxed text-pretty text-muted-foreground">{body}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-4">
          {action}
          {note ? <span className="cap text-muted-foreground">{note}</span> : null}
        </div>
      </div>
    </section>
  );
}
