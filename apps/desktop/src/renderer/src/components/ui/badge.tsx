import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-medium [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-primary/12 text-primary dark:bg-primary/25 dark:text-foreground',
        secondary: 'bg-foreground/[0.06] text-muted-foreground',
        destructive: 'bg-destructive/12 text-destructive',
        outline: 'border text-foreground/80',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
