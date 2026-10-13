import * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('rounded-sm bg-foreground/[0.07] motion-safe:animate-shimmer', className)}
      {...props}
    />
  );
}

export { Skeleton };
