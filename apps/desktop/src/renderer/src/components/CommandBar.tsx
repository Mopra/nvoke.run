import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleUser, CornerDownLeft, Globe, MapPin, Moon, Rocket, Rows3, Search as SearchIcon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, searchSubtitle, searchTitle } from '@/lib/format';
import { useSearches } from '@/lib/queries';
import { navigate } from '@/lib/router';
import { setThemePreference, useTheme } from '@/lib/theme';
import { StatusDot } from '@/components/indicators';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

interface Command {
  id: string;
  group: 'Searches' | 'Actions';
  label: string;
  hint?: string;
  icon: ReactNode;
  trailing?: ReactNode;
  keywords?: string;
  run: () => void;
}

/**
 * The command bar: one field that jumps to any search or runs an action.
 * Opened with Cmd or Ctrl K, or from the search field in the sidebar.
 */
export function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <DialogDescription className="sr-only">Jump to a search or run an action.</DialogDescription>
        {/* Mounted only while open, so every opening starts fresh. */}
        <Commands onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Commands({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { data: searches } = useSearches();
  const { resolved } = useTheme();
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const iconClass = 'size-4 text-muted-foreground';
    const list: Command[] = (searches ?? []).map((s) => ({
      id: `search:${s.id}`,
      group: 'Searches',
      label: searchTitle(s),
      hint: searchSubtitle(s),
      icon: (
        <span className="flex size-4 items-center justify-center">
          <StatusDot status={s.status} />
        </span>
      ),
      trailing: <span className="text-xs tabular-nums text-muted-foreground">{formatNumber(s.emailsFound)} emails</span>,
      run: () => navigate({ name: 'search', id: s.id }),
    }));
    list.push(
      {
        id: 'new:local',
        group: 'Actions',
        label: 'Find local businesses',
        icon: <MapPin className={iconClass} />,
        keywords: 'new search map city',
        run: () => navigate({ name: 'new', kind: 'local' }),
      },
      {
        id: 'new:web',
        group: 'Actions',
        label: 'Search the web',
        icon: <Globe className={iconClass} />,
        keywords: 'new search keyword',
        run: () => navigate({ name: 'new', kind: 'web' }),
      },
      {
        id: 'new:launches',
        group: 'Actions',
        label: 'Browse new launches',
        icon: <Rocket className={iconClass} />,
        keywords: 'new search product hunt show hn',
        run: () => navigate({ name: 'new', kind: 'launches' }),
      },
      {
        id: 'go:searches',
        group: 'Actions',
        label: 'All searches',
        icon: <Rows3 className={iconClass} />,
        run: () => navigate({ name: 'searches' }),
      },
      {
        id: 'go:account',
        group: 'Actions',
        label: 'Account and plan',
        icon: <CircleUser className={iconClass} />,
        keywords: 'usage billing sign out settings',
        run: () => navigate({ name: 'account' }),
      },
      {
        id: 'theme',
        group: 'Actions',
        label: resolved === 'dark' ? 'Use light appearance' : 'Use dark appearance',
        icon: resolved === 'dark' ? <Sun className={iconClass} /> : <Moon className={iconClass} />,
        keywords: 'theme mode',
        run: () => setThemePreference(resolved === 'dark' ? 'light' : 'dark'),
      },
    );
    return list;
  }, [searches, resolved]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q))
      : commands;
    // Without a query, show the five newest searches above the actions.
    const searchesShown = matches.filter((c) => c.group === 'Searches').slice(0, q ? 8 : 5);
    return [...searchesShown, ...matches.filter((c) => c.group === 'Actions')];
  }, [commands, query]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(command: Command | undefined): void {
    if (!command) return;
    onDone();
    command.run();
  }

  let lastGroup: string | null = null;

  return (
    <>
      <div className="flex h-14 items-center gap-3 border-b px-4">
        <SearchIcon className="size-[18px] shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(filtered.length - 1, i + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(filtered[active]);
            }
          }}
          placeholder="Search or jump to"
          aria-label="Search or jump to"
          className="h-full flex-1 bg-transparent text-lg tracking-[-0.01em] outline-none placeholder:text-muted-foreground/60"
        />
        <Kbd>esc</Kbd>
      </div>
      <div ref={listRef} role="listbox" className="max-h-[min(420px,56vh)] overflow-y-auto p-1.5">
        {filtered.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</div>}
        {filtered.map((command, index) => {
          const header = command.group !== lastGroup ? command.group : null;
          lastGroup = command.group;
          const selected = index === active;
          return (
            <div key={command.id}>
              {header && (
                <div className="px-2.5 pt-2 pb-1 text-xs font-semibold text-muted-foreground">{header}</div>
              )}
              <div
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                className={cn(
                  'flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm',
                  selected ? 'bg-accent text-foreground' : 'text-foreground/85',
                )}
              >
                {command.icon}
                <span className="truncate">{command.label}</span>
                {command.hint && <span className="truncate text-xs text-muted-foreground">{command.hint}</span>}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  {command.trailing}
                  {selected && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
