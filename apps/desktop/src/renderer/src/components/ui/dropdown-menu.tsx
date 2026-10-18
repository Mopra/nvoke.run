import * as React from 'react';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function DropdownMenu(props: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger(props: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          'screen z-50 min-w-48 overflow-hidden rounded-[6px] p-1.5',
          'origin-(--radix-dropdown-menu-content-transform-origin) duration-200 ease-spring data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.96] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100',
          className,
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
}

// The menu is a black screen: the highlighted item lights up a shade, the accent stays for shortcuts.
const itemClass =
  "relative flex h-8 cursor-default select-none items-center gap-2.5 rounded-[4px] px-2.5 text-sm text-screen-foreground/80 outline-none data-[highlighted]:bg-screen-dim/60 data-[highlighted]:text-screen-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg]:opacity-75";

function DropdownMenuItem({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { variant?: 'default' | 'destructive' }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      className={cn(
        itemClass,
        variant === 'destructive' &&
          'text-destructive data-[highlighted]:bg-destructive/15 data-[highlighted]:text-destructive',
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuRadioGroup(props: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(itemClass, 'pl-8', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2.5 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5 text-primary opacity-100" strokeWidth={2.5} />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Label>) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      className={cn('cap px-2.5 pt-2 pb-1 text-screen-foreground/45', className)}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('mx-2 my-1 h-px bg-screen-dim', className)}
      {...props}
    />
  );
}

/** The key that fires an item, printed at its right edge in the accent. */
function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="dropdown-menu-shortcut" className={cn('cap ml-auto pl-4 text-primary', className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
};
