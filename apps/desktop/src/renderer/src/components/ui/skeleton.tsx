import * as React from 'react';
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('rounded-[3px] bg-foreground/[0.07] motion-safe:animate-skeleton', className)}
      {...props}
    />
  );
}

export { Skeleton };
