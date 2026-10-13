import type { ReactNode } from 'react';
import { RotateCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** One quiet glyph, one line, at most one action. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-20 text-center motion-safe:animate-page-in', className)}>
      <Icon className="mb-4 size-7 text-muted-foreground/60" strokeWidth={1.5} />
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-20 text-center', className)}>
      <h2 className="text-base font-semibold">Could not load this</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          <RotateCw />
          Try again
        </Button>
      )}
    </div>
  );
}
