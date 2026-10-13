import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

/** An on and off toggle. The track takes the accent only when on. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[26px] w-[44px] shrink-0 cursor-default items-center rounded-full p-[3px] outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-45 data-[state=checked]:bg-primary data-[state=unchecked]:bg-foreground/[0.12]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 rounded-full bg-primary-foreground shadow-sm transition-transform duration-200 ease-out-soft data-[state=checked]:translate-x-[18px] data-[state=unchecked]:translate-x-0"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
