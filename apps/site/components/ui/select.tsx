import * as React from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A select whose list is drawn by the app, not the system, so it opens as a
 * black screen like the menus. The trigger is unstyled: callers set its look.
 */
const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

function SelectTrigger({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn('flex items-center outline-none', className)}
      {...props}
    >
      {children}
    </SelectPrimitive.Trigger>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 10,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        position={position}
        sideOffset={sideOffset}
        className={cn(
          'screen z-50 max-h-(--radix-select-content-available-height) min-w-56 overflow-hidden rounded-[6px] p-1.5',
          'origin-(--radix-select-content-transform-origin) duration-200 ease-spring data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.96] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport className="max-h-[min(360px,var(--radix-select-content-available-height))]">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

function SelectItem({ className, children, ...props }: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        'relative flex h-8 cursor-pointer select-none items-center rounded-[4px] pr-9 pl-3 text-sm text-screen-foreground/80 outline-none',
        'data-[highlighted]:bg-screen-dim/60 data-[highlighted]:text-screen-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 flex items-center text-primary">
        <CheckIcon className="size-4" strokeWidth={2.5} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue };
