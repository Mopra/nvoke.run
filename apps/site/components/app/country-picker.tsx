'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { CheckIcon, ChevronDown, Search as SearchIcon } from 'lucide-react';
import { countries, countryName, matchCountries } from '@/lib/app/desktop';
import { cn } from '@/lib/utils';

const ANY = { code: '', name: 'any country' };

/**
 * A searchable country picker: the trigger shows the choice, the black
 * screen below it (like the menus) has a search field and every country. Type to filter, arrows to
 * move, Enter to pick, Escape to close. Typing on the closed trigger opens it
 * with that text.
 */
export function CountryPicker({
  id,
  value,
  onChange,
  triggerClassName,
  anyLabel = ANY.name,
  chosen,
}: {
  id: string;
  /** ISO 3166-1 alpha-2, or '' for any country. */
  value: string;
  onChange: (code: string) => void;
  triggerClassName?: string;
  /** What the trigger says while no country is picked, like "Add a country" for a picker that adds to a list. */
  anyLabel?: string;
  /** Codes already in that list, checked in the panel. */
  chosen?: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = useMemo(() => {
    const matches = matchCountries(query);
    // "Any country" leads the full list, and shows while it still matches the query.
    return query.trim() && !ANY.name.includes(query.trim().toLowerCase()) ? matches : [ANY, ...matches];
  }, [query]);

  function openWith(text: string): void {
    setQuery(text);
    setActive(0);
    setOpen(true);
  }

  function pick(code: string): void {
    onChange(code);
    setOpen(false);
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Home' || event.key === 'PageUp') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End' || event.key === 'PageDown') {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[active];
      if (option) pick(option.code);
    }
  }

  const label = value ? (countryName(value) ?? value) : anyLabel;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          // Start at the current choice: "any country" leads the full list.
          setQuery('');
          setActive(value ? countries().findIndex((c) => c.code === value) + 1 : 0);
        }
      }}
    >
      <PopoverPrimitive.Trigger
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onKeyDown={(e) => {
          // Type ahead: a letter on the closed trigger opens the search with it.
          if (!open && e.key.length === 1 && /\p{L}/u.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            openWith(e.key);
          }
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault();
            openWith('');
          }
        }}
        className={cn('flex w-full items-center text-left outline-none', triggerClassName)}
      >
        <span className="min-w-0 flex-1 truncate py-[0.12em]">{label}</span>
        <ChevronDown
          className={cn('size-6 shrink-0 text-muted-foreground/60 transition-transform duration-200', open && 'rotate-180')}
          strokeWidth={1.75}
        />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={10}
          collisionPadding={16}
          onOpenAutoFocus={(e) => {
            // Focus goes to the search field, which Radix does not know about.
            e.preventDefault();
            (e.currentTarget as HTMLElement).querySelector('input')?.focus();
          }}
          className={cn(
            'screen z-50 flex w-[min(340px,calc(100vw-32px))] flex-col overflow-hidden rounded-[6px] outline-none',
            'max-h-[min(440px,var(--radix-popover-content-available-height))]',
            'origin-(--radix-popover-content-transform-origin) duration-200 ease-spring data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.96] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100',
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2.5 border-b border-screen-dim px-4">
            <SearchIcon className="size-4 shrink-0 text-screen-foreground/60" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search countries"
              aria-label="Search countries"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={options[active] ? `${listId}-${active}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-xs caret-primary outline-none placeholder:text-screen-foreground/40"
            />
          </div>
          <div ref={listRef} id={listId} role="listbox" aria-label="Countries" className="min-h-0 overflow-y-auto p-1.5">
            {options.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-screen-foreground/60">No country matches “{query.trim()}”</div>
            )}
            {options.map((option, index) => {
              const selected = chosen ? option.code !== '' && chosen.includes(option.code) : option.code === value;
              return (
                <div
                  key={option.code || 'any'}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={selected}
                  data-index={index}
                  onMouseMove={() => setActive(index)}
                  onClick={() => pick(option.code)}
                  className={cn(
                    'relative flex h-8 cursor-pointer items-center gap-3 rounded-[3px] pr-9 pl-3 text-sm',
                    index === active && 'bg-screen-foreground/10',
                  )}
                >
                  <span className="truncate first-letter:uppercase">{option.name}</span>
                  {option.code && <span className="cap text-screen-foreground/60">{option.code}</span>}
                  {selected && <CheckIcon className="absolute right-3 size-4 text-primary" strokeWidth={2.5} />}
                </div>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
