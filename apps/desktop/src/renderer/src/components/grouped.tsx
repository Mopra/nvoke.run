import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Inset grouped lists, the way macOS System Settings lays out a form: a
 * rounded group on the page, rows inside separated by hairlines that start at
 * the content edge, an optional caption above and a footnote below.
 */
export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex flex-col gap-1.5', className)}>
      {title && <h2 className="px-3.5 text-xs font-semibold text-muted-foreground">{title}</h2>}
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs dark:bg-card/80">{children}</div>
      {footer && <div className="px-3.5 text-xs text-muted-foreground">{footer}</div>}
    </section>
  );
}

/** A row with a label on the left and its control on the right. */
export function Row({
  label,
  htmlFor,
  description,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? 'label' : 'div';
  return (
    <div
      className={cn(
        'relative flex min-h-11 items-center gap-4 px-3.5 py-2',
        '[&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-3.5 [&+&]:before:h-px [&+&]:before:bg-border',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <Label htmlFor={htmlFor} className="block text-sm">
          {label}
        </Label>
        {description && <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>}
      </div>
      {children !== undefined && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/** A row whose field takes the width: label column, then the input. */
export function FieldRow({ label, htmlFor, children }: { label: ReactNode; htmlFor: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'relative flex min-h-11 items-center gap-3 py-1.5 pr-1.5 pl-3.5',
        '[&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-3.5 [&+&]:before:h-px [&+&]:before:bg-border',
      )}
    >
      <label htmlFor={htmlFor} className="w-36 shrink-0 text-sm">
        {label}
      </label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
