import * as React from 'react';
import { Label as LabelPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** A panel label: tiny mono capitals. */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn('cap flex select-none items-center gap-2 text-muted-foreground peer-disabled:opacity-50', className)}
      {...props}
    />
  );
}

export { Label };
