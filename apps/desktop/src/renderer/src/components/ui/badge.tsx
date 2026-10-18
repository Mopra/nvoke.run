import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  // Field: a printed tag, a small keycap without the travel.
  'inline-flex h-[18px] w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-medium [&>svg]:size-3 field:h-5 field:rounded-[3px] field:font-mono field:text-[9px] field:tracking-[0.1em] field:uppercase field:shadow-[0_1px_0_var(--glass-edge)]',
  {
    variants: {
      variant: {
        default: 'bg-primary/12 text-primary dark:bg-primary/25 dark:text-foreground field:bg-primary field:text-primary-foreground',
        secondary: 'bg-foreground/[0.06] text-muted-foreground field:bg-secondary field:text-secondary-foreground',
        destructive: 'bg-destructive/12 text-destructive field:bg-destructive field:text-destructive-foreground',
        outline: 'border text-foreground/80 field:bg-foreground field:text-background field:border-0',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
