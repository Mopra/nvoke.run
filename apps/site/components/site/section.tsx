import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** The page column: 16px gutters on phones, 24px from small screens up. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>;
}

/** A printed label above a headline, in mono capitals. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('cap text-muted-foreground', className)}>{children}</p>;
}

/**
 * A page section: an eyebrow, a light headline and a lede, then the content.
 * `plate` sets the section on a lifted plate with the lip of light along its
 * top, the site's way of grouping a module (docs/design/manual.md).
 * Centered by default (the API the inner pages rely on); `align="left"` reads like a panel.
 */
export function Section({
  id,
  eyebrow,
  title,
  intro,
  children,
  className,
  align = 'center',
  plate = false,
}: {
  id?: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  intro?: ReactNode;
  children?: ReactNode;
  className?: string;
  align?: 'center' | 'left';
  plate?: boolean;
}) {
  const headingId = id ? `${id}-title` : undefined;
  const body = (
    <>
      <div
        className={cn(
          'flex max-w-3xl flex-col gap-5',
          align === 'center' ? 'mx-auto items-center text-center' : 'items-start',
        )}
      >
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <h2 id={headingId} className="text-headline font-light">
          {title}
        </h2>
        {intro ? <p className="max-w-2xl text-lede text-pretty text-muted-foreground">{intro}</p> : null}
      </div>
      {children ? <div className="mt-10 sm:mt-14">{children}</div> : null}
    </>
  );
  return (
    <section id={id} aria-labelledby={headingId} className={cn('py-6 sm:py-8', !plate && 'py-14 sm:py-20', className)}>
      <Container>{plate ? <div className="panel px-5 py-10 sm:px-10 sm:py-14">{body}</div> : body}</Container>
    </section>
  );
}

/** Title block for the inner pages: an eyebrow, a light display headline, a lede. */
export function PageHeader({
  title,
  intro,
  icon,
  eyebrow,
  children,
}: {
  title: ReactNode;
  intro?: ReactNode;
  /** Shown above the title, like the mark on a name plate. */
  icon?: ReactNode;
  eyebrow?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Container className="relative pt-16 pb-12 sm:pt-24 sm:pb-16">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 text-center">
        {icon ? <div className="mb-4">{icon}</div> : null}
        {eyebrow ? <Eyebrow className="text-primary">{eyebrow}</Eyebrow> : null}
        <h1 className="text-display font-light">{title}</h1>
        {intro ? <p className="max-w-2xl text-lede text-pretty text-muted-foreground">{intro}</p> : null}
        {children}
      </div>
    </Container>
  );
}
