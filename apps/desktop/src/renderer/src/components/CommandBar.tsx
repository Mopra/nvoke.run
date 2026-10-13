import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleUser, ClipboardList, CornerDownLeft, Globe, Inbox, MapPin, Moon, Rocket, Rows3, ScanText, Search as SearchIcon, Sparkles, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, searchSubtitle, searchTitle } from '@/lib/format';
import { useSearches } from '@/lib/queries';
import { quickApi } from '@/lib/desktop';
import { parseQuickSearch } from '@/lib/quick-search';
import { navigate as goTo, routeHref, type Route } from '@/lib/router';
import type { SearchInput } from '@/lib/types';
import type { FrontTab, QuickClipboard } from '../../../ipc/contract';
import { setThemePreference, useTheme } from '@/lib/theme';
import { StatusDot } from '@/components/indicators';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

interface Command {
  id: string;
  group: 'Start' | 'Searches' | 'Actions';
  label: string;
  hint?: string;
  icon: ReactNode;
  trailing?: ReactNode;
  keywords?: string;
  /** Keep the window up after running, because the command starts something it then shows. */
  keepOpen?: boolean;
  run: () => void;
}

/**
 * The command bar: one field that jumps to any search or runs an action.
 * Opened with Cmd or Ctrl K, or from the island at the top of the window.
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

/**
 * The list itself. In the quick window (`onStart` set) Enter on typed text
 * starts a search, and screens open in the main window instead of this one.
 */
export function Commands({
  onDone,
  onStart,
  notice,
  clipboard,
  frontTab,
  onReadFrontTab,
  onFrontTabDenied,
  onGrab,
}: {
  onDone: () => void;
  onStart?: (input: SearchInput) => void;
  notice?: string | null;
  /** What the clipboard named when the quick window opened. Offered as the first row. */
  clipboard?: QuickClipboard;
  /** The site in the browser tab that was in front when the quick window opened. Offered above the clipboard. */
  frontTab?: FrontTab | null;
  /** macOS: asks for the Automation permission, then reads the tab and looks it up. */
  onReadFrontTab?: () => void;
  /** macOS: the user refused that permission; explain where to allow it. */
  onFrontTabDenied?: (browser: string) => void;
  /** Grab from screen, offered in the quick window. */
  onGrab?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { data: searches } = useSearches();
  const { resolved } = useTheme();
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const iconClass = 'size-4 text-muted-foreground';
    const quick = !!onStart;
    // A screen opens here in the main window, or in the main window from the quick one.
    const navigate = (route: Route): void => (quick ? quickApi()?.openInMain(routeHref(route)) : goTo(route));
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
        id: 'new:domains',
        group: 'Actions',
        label: 'Paste a list of companies',
        icon: <ClipboardList className={iconClass} />,
        keywords: 'new search domains websites names list enrich',
        run: () => navigate({ name: 'new', kind: 'domains' }),
      },
      {
        id: 'new:drop',
        group: 'Actions',
        label: 'New daily drop',
        icon: <Inbox className={iconClass} />,
        keywords: 'drops fresh daily launches subscribe',
        run: () => navigate({ name: 'drop', id: null }),
      },
      {
        id: 'go:drops',
        group: 'Actions',
        label: 'Drops',
        icon: <Inbox className={iconClass} />,
        keywords: 'fresh daily launches',
        run: () => navigate({ name: 'drops' }),
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
  }, [searches, resolved, onStart]);

  const lookup = useMemo<Command | null>(() => {
    if (!clipboard || !onStart) return null;
    const { domain, from } = clipboard;
    return {
      id: 'lookup',
      group: 'Start',
      label: `Find contacts at ${domain}`,
      hint: from === 'email' ? 'From the copied email' : from === 'url' ? 'From the copied link' : 'From the clipboard',
      icon: <ClipboardList className="size-4 text-primary" />,
      keepOpen: true,
      run: () => onStart({ kind: 'domains', params: { items: [domain] }, limit: 1 }),
    };
  }, [clipboard, onStart]);

  const site = useMemo<Command | null>(() => {
    if (!frontTab || !onStart) return null;
    const base = { id: 'front-tab', group: 'Start' as const, label: 'Who runs this site', icon: <Globe className="size-4 text-primary" />, keepOpen: true };
    if (frontTab.status === 'read') {
      const { domain, browser } = frontTab;
      return {
        ...base,
        hint: `In ${browser}`,
        trailing: <code className="max-w-56 truncate font-mono text-xs text-muted-foreground">{domain}</code>,
        run: () => onStart({ kind: 'domains', params: { items: [domain] }, limit: 1 }),
      };
    }
    if (frontTab.status === 'ask') {
      return {
        ...base,
        hint: `macOS asks once to let nvoke read ${frontTab.browser}’s address bar`,
        run: () => onReadFrontTab?.(),
      };
    }
    return {
      ...base,
      hint: `Allow nvoke to read ${frontTab.browser} in System Settings`,
      run: () => onFrontTabDenied?.(frontTab.browser),
    };
  }, [frontTab, onStart, onReadFrontTab, onFrontTabDenied]);
  const grab = useMemo<Command | null>(() => {
    if (!onGrab) return null;
    return {
      id: 'grab',
      group: 'Start',
      label: 'Grab from screen',
      hint: 'Read a list of companies off any app',
      icon: <ScanText className="size-4 text-muted-foreground" />,
      keywords: 'ocr scan screenshot capture exhibitors directory linkedin pdf',
      keepOpen: true,
      run: onGrab,
    };
  }, [onGrab]);

  const start = useMemo<Command | null>(() => {
    const input = onStart ? parseQuickSearch(query) : null;
    if (!input || !onStart) return null;
    return {
      id: 'start',
      group: 'Start',
      label: `Find ${input.kind === 'local' ? `${input.params.niche} in ${input.params.location}` : `“${input.params.keyword}”`}`,
      hint: input.kind === 'local' ? 'Local businesses' : 'Web search',
      icon: <Sparkles className="size-4 text-primary" />,
      keepOpen: true,
      run: () => onStart(input),
    };
  }, [query, onStart]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? commands.filter((c) => `${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`.toLowerCase().includes(q))
      : commands;
    // Without a query, show the five newest searches above the actions.
    const searchesShown = matches.filter((c) => c.group === 'Searches').slice(0, q ? 8 : 5);
    // Typed text starts its own search. Without it, the front tab then the
    // clipboard, once when both name the same site.
    const sameSite = site && lookup && frontTab?.status === 'read' && frontTab.domain === clipboard?.domain;
    const first = start ? [start] : q ? [] : [site, sameSite ? null : lookup].filter((c): c is Command => !!c);
    const grabShown = grab && (!q || `${grab.label} ${grab.keywords ?? ''}`.toLowerCase().includes(q)) ? grab : null;
    return [...first, ...(grabShown ? [grabShown] : []), ...searchesShown, ...matches.filter((c) => c.group === 'Actions')];
  }, [commands, query, start, lookup, site, frontTab, clipboard, grab]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(command: Command | undefined): void {
    if (!command) return;
    if (!command.keepOpen) onDone();
    command.run();
  }

  let lastGroup: string | null = null;

  return (
    <>
      <div className="flex h-16 items-center gap-3.5 border-b px-5">
        <SearchIcon className="size-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
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
          placeholder={onStart ? 'Find companies, or jump to' : 'Search or jump to'}
          aria-label="Search or jump to"
          className="h-full flex-1 bg-transparent font-display text-xl tracking-[-0.02em] caret-primary outline-none placeholder:text-muted-foreground/50"
        />
        <Kbd>esc</Kbd>
      </div>
      {notice && <div className="px-5 pt-3 text-sm text-destructive">{notice}</div>}
      <div ref={listRef} role="listbox" className="max-h-[min(460px,60vh)] overflow-y-auto p-2">
        {filtered.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches</div>}
        {filtered.map((command, index) => {
          const header = command.group !== lastGroup ? command.group : null;
          lastGroup = command.group;
          const selected = index === active;
          return (
            <div key={command.id}>
              {header && (
                <div className="px-3 pt-3 pb-1.5 text-xs text-muted-foreground">{header}</div>
              )}
              <div
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-[16px] px-3 text-sm transition-colors duration-100',
                  selected ? 'bg-foreground/[0.07] text-foreground' : 'text-foreground/85',
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
