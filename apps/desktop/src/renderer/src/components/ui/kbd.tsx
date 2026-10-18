import * as React from 'react';
import { cn } from '@/lib/utils';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-[18px] min-w-[18px] select-none items-center justify-center gap-0.5 rounded-[3px] bg-foreground/[0.05] px-1.5 font-mono text-[10.5px] font-medium tracking-[0.06em] uppercase text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
