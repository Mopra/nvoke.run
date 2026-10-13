import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-5 sm:px-6', className)}>{children}</div>;
}

export function Section({
  id,
  title,
  intro,
  children,
  className,
}: {
  id?: string;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn('py-20 sm:py-28', className)}>
      <Container>
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 id={headingId} className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {title}
          </h2>
          {intro ? <p className="text-lg text-pretty text-muted-foreground">{intro}</p> : null}
        </div>
        {children ? <div className="mt-12 sm:mt-16">{children}</div> : null}
      </Container>
    </section>
  );
}

/** Page title block for the inner pages. */
export function PageHeader({ title, intro }: { title: ReactNode; intro?: ReactNode }) {
  return (
    <Container className="pt-16 pb-10 sm:pt-24 sm:pb-14">
      <div className="flex max-w-2xl flex-col gap-4">
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        {intro ? <p className="text-lg text-pretty text-muted-foreground">{intro}</p> : null}
      </div>
    </Container>
  );
}
