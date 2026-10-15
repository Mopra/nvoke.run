import * as React from 'react';
import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-[18px] min-w-[18px] select-none items-center justify-center gap-0.5 rounded-[6px] bg-foreground/[0.05] px-1.5 font-sans text-2xs font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
