import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Desktop window frame for product mockups. OS-neutral title bar with three
 * dots, so it reads as an app window on any platform.
 */
export function MockWindow({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card text-card-foreground shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5',
        className,
      )}
    >
      <div className="relative flex h-9 items-center border-b border-sidebar-border bg-sidebar px-3">
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
          <span className="size-2.5 rounded-full bg-foreground/15" />
        </div>
        <span className="absolute inset-x-0 text-center text-xs text-muted-foreground">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** A fake form field: label above a bordered value. */
export function MockField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="truncate rounded-md border border-input bg-background px-3 py-2 text-sm">{value}</span>
    </div>
  );
}
