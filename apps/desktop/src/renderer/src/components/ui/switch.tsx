import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** A chunky toggle: a square thumb in a recessed track that lights orange when on. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[22px] w-[40px] shrink-0 cursor-default items-center rounded-[4px] p-[3px] outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-45 data-[state=checked]:bg-primary data-[state=checked]:shadow-glow data-[state=unchecked]:bg-foreground/[0.12] data-[state=unchecked]:shadow-[inset_0_1px_2px_var(--shadow-color)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block h-4 w-[18px] rounded-[3px] bg-primary-foreground shadow-[0_1px_0_var(--glass-edge),0_1px_2px_var(--shadow-color)] transition-transform duration-200 ease-out-soft data-[state=checked]:translate-x-[16px] data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
