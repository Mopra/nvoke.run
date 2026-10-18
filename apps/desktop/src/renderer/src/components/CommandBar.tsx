import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Building2, CircleUser, ClipboardList, CornerDownLeft, Globe, Inbox, MapPin, Moon, Rocket, Rows3, ScanText, Search as SearchIcon, Sparkles, Sun, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber, searchSubtitle, searchTitle } from '@/lib/format';
import { useFindLeads, useSearches } from '@/lib/queries';
import { useStagger } from '@/lib/motion';
import { leadHint } from '@/lib/lead-find';
import { quickApi } from '@/lib/desktop';
import { parseQuickIcp, parseQuickSearch } from '@/lib/quick-search';
import { navigate as goTo, routeHref, type Route } from '@/lib/router';
import type { SearchInput, SearchStatus } from '@/lib/types';
import type { FrontTab, QuickClipboard } from '../../../ipc/contract';
import { setThemePreference, useTheme } from '@/lib/theme';
import { StatusDot } from '@/components/indicators';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

interface Command {
  id: string;
  group: 'Start' | 'Searches' | 'Leads' | 'Actions';
  label: string;
  hint?: string;
  /** Set the hint in monospace, for an address or domain. */
  hintMono?: boolean;
  icon: ReactNode;
  trailing?: ReactNode;
  keywords?: string;
  /** Keep the window up after running, because the command starts something it then shows. */
  keepOpen?: boolean;
  run: () => void;
}

/** A search's status as an LED, shown in Field in place of the dot: lit while it runs, green when done, red when failed. */
function StatusLed({ status }: { status: SearchStatus }) {
  const live = status === 'running' || status === 'queued';
  return (
    <span
      aria-hidden
      className={cn(
        'hidden field:led',
        live && 'field:led-on',
        status === 'done' && 'field:bg-chart-1 field:shadow-[0_0_5px_var(--chart-1)]',
        status === 'failed' && 'field:bg-destructive',
      )}
    />
  );
}

/**
 * The command bar: one field that jumps to any search, finds any lead in the
 * local copy, or runs an action.
 * Opened with Cmd or Ctrl K, or from the island at the top of the window.
 */
export function CommandBar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* In Field the bar is a black display. The important marks beat the glass plate rule in index.css. */}
      <DialogContent
        aria-describedby={undefined}
        className="field:rounded-[8px] field:bg-screen field:text-screen-foreground field:shadow-[0_0_0_1px_var(--screen),0_40px_80px_-20px_var(--shadow-strong)]"
      >
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <DialogDescription className="sr-only">Jump to a search, find a lead or run an action.</DialogDescription>
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
  const { data: found } = useFindLeads(query);
  const { resolved } = useTheme();
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Command[]>(() => {
    const iconClass = 'size-4 text-muted-foreground field:text-screen-foreground/50';
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
          <StatusDot status={s.status} className="field:hidden" />
          <StatusLed status={s.status} />
        </span>
      ),
      trailing: <span className="text-xs tabular-nums text-muted-foreground field:text-inherit">{formatNumber(s.emailsFound)} emails</span>,
      run: () => navigate({ name: 'search', id: s.id }),
    }));
    list.push(
      {
        id: 'new:icp',
        group: 'Actions',
        label: 'Describe your customer',
        hint: 'Plain words, nvoke plans the search',
        icon: <UsersRound className={iconClass} />,
        keywords: 'new search who do you sell to people decision makers icp',
        run: () => navigate({ name: 'new', kind: null }),
      },
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
        trailing: <code className="max-w-56 truncate font-mono text-xs text-muted-foreground field:text-inherit">{domain}</code>,
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
      icon: <ScanText className="size-4 text-muted-foreground field:text-screen-foreground/50" />,
      keywords: 'ocr scan screenshot capture exhibitors directory linkedin pdf',
      keepOpen: true,
      run: onGrab,
    };
  }, [onGrab]);

  /**
   * Typed text starts a search: a description of who you sell to finds the
   * people at those companies (leads first when it reads like one), and a
   * keyword or "niche in place" runs a web or local search.
   */
  const starts = useMemo<Command[]>(() => {
    if (!onStart) return [];
    const input = parseQuickSearch(query);
    const icp = parseQuickIcp(query);
    const out: Command[] = [];
    if (icp) {
      out.push({
        id: 'start:icp',
        group: 'Start',
        label: `Find leads: ${icp.input.params.description}`,
        hint: '1,000 to start, then keeps finding more',
        icon: <UsersRound className="size-4 text-primary" />,
        keepOpen: true,
        run: () => onStart(icp.input),
      });
    }
    if (input) {
      const row: Command = {
        id: 'start',
        group: 'Start',
        label: `Find ${input.kind === 'local' ? `${input.params.niche} in ${input.params.location}` : `“${input.params.keyword}”`}`,
        hint: input.kind === 'local' ? 'Local businesses' : 'Web search',
        icon: <Sparkles className={cn('size-4', icp?.describes ? 'text-muted-foreground field:text-screen-foreground/50' : 'text-primary')} />,
        keepOpen: true,
        run: () => onStart(input),
      };
      if (icp?.describes) out.push(row);
      else out.unshift(row);
    }
    return out;
  }, [query, onStart]);

  /** Companies from every search in the local copy that match the text. */
  const leads = useMemo<Command[]>(() => {
    const q = query.trim();
    if (q.length < 2 || !found) return [];
    const quick = !!onStart;
    return found.hits.map(({ search, company }) => ({
      id: `lead:${search.id}:${company.id}`,
      group: 'Leads',
      label: company.name || company.domain,
      hint: leadHint(company, q),
      hintMono: true,
      icon: <Building2 className="size-4 text-muted-foreground field:text-screen-foreground/50" />,
      trailing: <span className="max-w-40 truncate text-xs text-muted-foreground field:text-inherit">{searchTitle(search)}</span>,
      // Opens the search filtered to this company, so the row is the first one there.
      run: () => {
        const route: Route = { name: 'search', id: search.id, q: company.domain || company.name };
        if (quick) quickApi()?.openInMain(routeHref(route));
        else goTo(route);
      },
    }));
  }, [found, query, onStart]);
  const leadsMore = found && query.trim().length >= 2 ? found.total - leads.length : 0;

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
    const first = starts.length > 0 ? starts : q ? [] : [site, sameSite ? null : lookup].filter((c): c is Command => !!c);
    const grabShown = grab && (!q || `${grab.label} ${grab.keywords ?? ''}`.toLowerCase().includes(q)) ? grab : null;
    return [...first, ...(grabShown ? [grabShown] : []), ...searchesShown, ...leads, ...matches.filter((c) => c.group === 'Actions')];
  }, [commands, query, starts, lookup, site, frontTab, clipboard, grab, leads]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function run(command: Command | undefined): void {
    if (!command) return;
    if (!command.keepOpen) onDone();
    command.run();
  }

  let lastGroup: string | null = null;
  const stagger = useStagger();

  return (
    <>
      <div className="flex h-16 items-center gap-3.5 border-b px-5 field:h-14 field:border-screen-dim">
        <SearchIcon className="size-5 shrink-0 text-muted-foreground field:text-screen-foreground/40" strokeWidth={1.75} />
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
          placeholder={onStart ? 'Find companies, or jump to' : 'Find a lead, or jump to'}
          aria-label="Search or jump to"
          spellCheck={false}
          autoComplete="off"
          className="h-full flex-1 bg-transparent font-display text-xl tracking-[-0.02em] caret-primary outline-none placeholder:text-muted-foreground/50 field:lcd field:text-xl field:tracking-normal field:text-screen-foreground field:uppercase field:placeholder:text-screen-dim field:placeholder:[text-shadow:none]"
        />
        <Kbd className="field:bg-screen-dim/60 field:text-screen-foreground/50">esc</Kbd>
      </div>
      {notice && <div className="px-5 pt-3 text-sm text-destructive">{notice}</div>}
      {/* The rows cascade in as the bar opens; after that they follow the typing at once, and found leads fade in. */}
      <div ref={listRef} role="listbox" className={cn('max-h-[min(460px,60vh)] overflow-y-auto p-2', !stagger.settled && 'stagger')}>
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground field:cap field:text-screen-foreground/40">No matches</div>
        )}
        {filtered.map((command, index) => {
          const header = command.group !== lastGroup ? command.group : null;
          lastGroup = command.group;
          const selected = index === active;
          return (
            <div
              key={command.id}
              style={stagger.style(index)}
              className={cn(stagger.settled && command.group === 'Leads' && 'motion-safe:animate-fade-in')}
            >
              {header && (
                <div className="flex px-3 pt-3 pb-1.5 text-xs text-muted-foreground field:cap field:tracking-[0.12em] field:text-screen-foreground/40">
                  {header}
                  {header === 'Leads' && leadsMore > 0 && (
                    <span className="ml-auto tabular-nums">{formatNumber(leadsMore)} more</span>
                  )}
                </div>
              )}
              <div
                role="option"
                aria-selected={selected}
                data-index={index}
                onMouseMove={() => setActive(index)}
                onClick={() => run(command)}
                className={cn(
                  'flex h-10 items-center gap-3 rounded-[16px] px-3 text-sm transition-colors duration-100 field:rounded-[4px]',
                  selected
                    ? 'bg-foreground/[0.07] text-foreground field:bg-screen-dim/60 field:text-screen-foreground'
                    : 'text-foreground/85 field:text-screen-foreground/80',
                )}
              >
                {command.icon}
                <span className="truncate" title={command.label}>
                  {command.label}
                </span>
                {command.hint && (
                  <span className={cn('truncate text-xs text-muted-foreground field:text-screen-foreground/40', command.hintMono && 'font-mono')}>
                    {command.hint}
                  </span>
                )}
                {/* The shortcut side: in Field a cap that turns orange on the selected row, and the trailing text inherits it. */}
                <span
                  className={cn(
                    'ml-auto flex shrink-0 items-center gap-2 field:cap',
                    selected ? 'field:text-primary' : 'field:text-screen-foreground/40',
                  )}
                >
                  {command.trailing}
                  {selected && <CornerDownLeft className="size-3.5 text-muted-foreground field:text-inherit" />}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
