import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6', className)}>{children}</div>;
}

/**
 * A page section: a large headline and a lede, then the content. Centered by
 * default, like a product page; `align="left"` for reading sections.
 */
export function Section({
  id,
  title,
  intro,
  children,
  className,
  align = 'center',
}: {
  id?: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  align?: 'center' | 'left';
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn('py-24 sm:py-36', className)}>
      <Container>
        <div
          className={cn(
            'flex max-w-3xl flex-col gap-5',
            align === 'center' ? 'mx-auto items-center text-center' : 'items-start',
          )}
        >
          <h2 id={headingId} className="text-headline font-semibold text-balance">
            {title}
          </h2>
          {intro ? <p className="max-w-2xl text-lede text-pretty text-muted-foreground">{intro}</p> : null}
        </div>
        {children ? <div className="mt-14 sm:mt-20">{children}</div> : null}
      </Container>
    </section>
  );
}

/** Title block for the inner pages. */
export function PageHeader({
  title,
  intro,
  icon,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  /** Shown above the title, like an app icon on a product page. */
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Container className="relative pt-20 pb-14 sm:pt-28 sm:pb-20">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 text-center">
        {icon ? <div className="mb-5">{icon}</div> : null}
        <h1 className="text-display font-semibold text-balance">{title}</h1>
        {intro ? <p className="max-w-2xl text-lede text-pretty text-muted-foreground">{intro}</p> : null}
        {children}
      </div>
    </Container>
  );
}
