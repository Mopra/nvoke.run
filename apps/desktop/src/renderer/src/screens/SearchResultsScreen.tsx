import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Ban,
  ChevronDown,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  ListPlus,
  Inbox,
  Info,
  Loader2,
  MoreHorizontal,
  PenLine,
  Radar,
  RotateCw,
  SearchX,
  Search as SearchIcon,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { BackButton, PageHeader } from '@/components/AppShell';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { ExportNoticeDialog } from '@/components/ExportNoticeDialog';
import { StatusLabel, VERIFICATION_DOT, VerificationBadge } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { canSearchMore, fewFoundLine, RunsLine, SearchMoreEditor } from '@/components/SearchMore';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api, ApiError } from '@/lib/api';
import { BILLING_URL } from '@/lib/env';
import { shouldShowExportNotice } from '@/lib/export-notice';
import { companiesToCsv, companiesToTsv } from '@/lib/csv';
import {
  csvFileName,
  duration,
  errorMessage,
  formatNumber,
  isActive,
  offlineCaption,
  relativeTime,
  searchSubtitle,
  searchTitle,
  VERIFICATION_LABEL,
} from '@/lib/format';
import { isMac, modKey, useModHotkey } from '@/lib/hotkeys';
import {
  useCancelSearch,
  useCompanies,
  useCreateSearch,
  useDraftOpeners,
  useFollowOpeners,
  useLocalStatus,
  useRefreshWhenFinished,
  useSearch,
} from '@/lib/queries';
import { navigate } from '@/lib/router';
import { clickSelect, EMPTY_SELECTION, pickSelected, type Selection } from '@/lib/selection';
import type { Company, DraftOpenersInput, Email, EmailKind, Opener, Search, SearchInput, Verification } from '@/lib/types';
import { useDesktopSettings } from '@/lib/desktop';
import { handsToLocalCrawl } from '@nvoke/shared';
import { cn } from '@/lib/utils';

const COLUMNS = 'grid grid-cols-[minmax(12rem,1fr)_minmax(19rem,1.6fr)_minmax(8rem,0.6fr)_4rem] gap-6';

/** Labels for Company.source, as the server's source adapters set it. */
const SOURCE_LABEL: Record<string, string> = {
  osm: 'OpenStreetMap',
  brave: 'Web search',
  product_hunt: 'Product Hunt',
  show_hn: 'Show HN',
};

const VERIFICATION_ORDER: Verification[] = ['valid', 'catch_all', 'risky', 'unknown', 'invalid'];

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Couldn’t copy to the clipboard');
  }
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/* Overview */

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-4xl font-extralight tabular-nums">{formatNumber(value)}</span>
        {sub && <span className="truncate text-sm tabular-nums text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Overview({
  search,
  timing,
  onRunAgain,
  starting,
  editing,
  onSearchMore,
  onCloseMore,
}: {
  search: Search;
  timing: string;
  onRunAgain: () => void;
  starting: boolean;
  /** Search more is open in place of the numbers. */
  editing: boolean;
  onSearchMore: () => void;
  onCloseMore: () => void;
}) {
  const active = isActive(search.status);
  const few = fewFoundLine(search);
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  return (
    <section className="px-6 pt-8 pb-10">
      <h1 className="font-display text-3xl font-semibold text-balance">{searchTitle(search)}</h1>
      <div className="mt-2 flex items-center gap-2.5 text-sm text-muted-foreground">
        <StatusLabel status={search.status} />
        <span className="truncate">
          {searchSubtitle(search)}, {timing}
        </span>
      </div>
      <RunsLine search={search} />
      {editing && canSearchMore(search) ? (
        <SearchMoreEditor search={search} onClose={onCloseMore} />
      ) : (
        <>
          <div className="mt-10 grid grid-cols-4 gap-8">
            <Stat label="Companies" value={search.companiesFound} sub={`of ${formatNumber(search.limit)}`} />
            <Stat label="Websites crawled" value={search.companiesCrawled} />
            <Stat label="Emails found" value={search.emailsFound} />
            <Stat label="Valid emails" value={search.emailsValid} sub={validShare === null ? undefined : `${validShare}%`} />
          </div>
          {active && (
            <div className="mt-8 flex items-center gap-5">
              <SearchProgress search={search} className="h-[3px] flex-1" />
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
            </div>
          )}
          {canSearchMore(search) && search.status !== 'failed' && (
            <div className="mt-8 flex items-center gap-4">
              <Button variant="glass" size="sm" className="h-9 px-4" onClick={onSearchMore}>
                <ListPlus />
                Search more
              </Button>
              {few && <span className="text-sm text-muted-foreground">{few}</span>}
            </div>
          )}
          {search.status === 'failed' && (
            <div className="mt-8 flex items-center gap-3 rounded-[20px] bg-destructive/8 px-4 py-3 text-sm">
              <TriangleAlert className="size-4 shrink-0 text-destructive" />
              <span className="flex-1">{errorMessage(search.error)} The results found until then are kept below.</span>
              {search.error === 'quota_exceeded' ? (
                <Button size="sm" variant="outline" onClick={() => void api.openExternal(BILLING_URL)}>
                  Upgrade
                </Button>
              ) : search.kind === 'drop' ? null : (
                <>
                  <Button size="sm" variant="ghost" onClick={onRunAgain} disabled={starting}>
                    <RotateCw />
                    Run again
                  </Button>
                  <Button size="sm" variant="outline" onClick={onSearchMore}>
                    <ListPlus />
                    Search more
                  </Button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/* Rows */

function EmailLine({ email, checking }: { email: Email; checking: boolean }) {
  return (
    <div className="group/email flex min-w-0 items-center gap-2">
      <button
        type="button"
        data-copy-email
        onClick={() => void copy(email.address, email.address)}
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left font-mono text-xs text-foreground/80 outline-none hover:text-primary dark:text-foreground/65 dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        title="Copy email"
      >
        <span className="truncate">{email.address}</span>
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/email:opacity-60" />
      </button>
      {email.kind === 'personal' && <span className="shrink-0 text-2xs text-muted-foreground">person</span>}
      <span className="ml-auto" />
      <VerificationBadge value={email.verification ?? 'unknown'} pending={checking && email.verification === null} />
    </div>
  );
}

const LOCAL_WHY: Record<string, string> = { js_only: 'Needs JavaScript', refused: 'Refuses our servers', done: 'No public email' };

/** A site our servers found no address on, and where the desktop's own read of it stands. */
function LocalCrawlLine({ company }: { company: Company }) {
  const { data: settings } = useDesktopSettings();
  const quiet = 'text-xs leading-5 text-muted-foreground';
  const why = LOCAL_WHY[company.crawlStatus] ?? 'No public email';
  // A read site with no address is only a maybe: say nothing more until this computer has tried.
  if (company.crawlStatus === 'done' && company.localCrawl !== 'claimed') return <span className={quiet}>{why}</span>;
  if (company.localCrawl === 'claimed') {
    return (
      <span className={cn(quiet, 'inline-flex items-center gap-2')}>
        <Loader2 className="size-3 text-primary motion-safe:animate-spin" />
        Reading from this computer
      </span>
    );
  }
  if (company.localCrawl === 'failed') return <span className={quiet}>{why}, and unreachable from here too</span>;
  if (company.localCrawl === 'blocked') return <span className={quiet}>Asks for a login or a CAPTCHA, so we stay out</span>;
  if (settings?.localCrawl) return <span className={quiet}>{why}. Read from this computer when it’s idle</span>;
  if (settings) return <span className={quiet}>{why}. Turn on reading from this computer in Account</span>;
  return <span className={quiet}>{why}. The desktop app can read it</span>;
}

function EmailsCell({ company, live }: { company: Company; live: boolean }) {
  const quiet = 'text-xs leading-5 text-muted-foreground';
  if (company.crawlStatus === 'pending') {
    return (
      <span className={cn(quiet, 'inline-flex items-center gap-2')}>
        <Loader2 className="size-3 motion-safe:animate-spin" />
        Queued
      </span>
    );
  }
  if (company.crawlStatus === 'blocked') return <span className={quiet}>Site blocks crawlers, so we stay out</span>;
  if (company.crawlStatus === 'failed') return <span className={quiet}>Site unreachable</span>;
  if (company.emails.length === 0 && handsToLocalCrawl(company.crawlStatus, 0) && company.localCrawl !== 'done') {
    return <LocalCrawlLine company={company} />;
  }
  if (company.emails.length === 0) return <span className={quiet}>No public email</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {company.emails.map((e) => (
        <EmailLine key={e.id} email={e} checking={live} />
      ))}
    </div>
  );
}

/** The page an opener's fact comes from, as a short path. */
function sourcePath(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/$/, '');
    return path || 'home page';
  } catch {
    return url;
  }
}

/**
 * Lets a mouse drag select the opener's text instead of dragging the row out.
 * The row turns draggable again on mouse up.
 */
function holdRowDrag(event: ReactMouseEvent): void {
  const row = event.currentTarget.closest<HTMLElement>('[data-company-row]');
  if (!row) return;
  row.draggable = false;
  window.addEventListener('mouseup', () => (row.draggable = true), { once: true });
}

/** The drafted first line under a company, or where drafting it stands. */
function OpenerLine({ opener }: { opener: Opener }) {
  const quiet = 'text-xs leading-5 text-muted-foreground';
  if (opener.status === 'queued') {
    return (
      <span data-opener="queued" className={cn(quiet, 'inline-flex items-center gap-2')}>
        <Loader2 className="size-3 text-primary motion-safe:animate-spin" />
        Drafting opener
      </span>
    );
  }
  if (opener.status === 'none') {
    return (
      <span data-opener="none" className={cn(quiet, 'opacity-70')}>
        No fact on the site to build on
      </span>
    );
  }
  if (opener.status === 'failed' || !opener.line) {
    return (
      <span data-opener="failed" className={cn(quiet, 'opacity-70')}>
        Opener failed
      </span>
    );
  }
  const { line, sourceUrl, quote } = opener;
  return (
    <div data-opener="done" className="group/opener flex min-w-0 items-start gap-2">
      <p
        onMouseDown={holdRowDrag}
        className="min-w-0 cursor-text text-[13px] leading-5 text-pretty text-foreground/80 select-text dark:text-foreground/70"
      >
        {line}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          data-copy-opener
          onClick={() => void copy(line, 'opener')}
          aria-label="Copy opener"
          title="Copy opener"
          className="flex size-5 items-center justify-center rounded-full text-muted-foreground opacity-0 outline-none transition-opacity group-hover/opener:opacity-100 hover:text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Copy className="size-3" />
        </button>
        {sourceUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => void api.openExternal(sourceUrl)}
                className="max-w-40 truncate rounded-sm text-left text-2xs leading-5 text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                from <span className="font-mono">{sourcePath(sourceUrl)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 rounded-2xl px-3 py-2 leading-relaxed">
              {quote ? `“${quote}”` : sourceUrl}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

function CompanyRow({
  company,
  live,
  selected,
  joinAbove,
  joinBelow,
  onSelect,
  onDragOut,
}: {
  company: Company;
  live: boolean;
  selected: boolean;
  /** The row above or below is selected too, so the run reads as one block. */
  joinAbove: boolean;
  joinBelow: boolean;
  onSelect: (id: string, event: ReactMouseEvent) => void;
  onDragOut: (id: string, event: ReactDragEvent) => void;
}) {
  const source = SOURCE_LABEL[company.source] ?? company.source;
  // Older local copies have no `opener` field at all.
  const opener = company.opener ?? null;
  return (
    <div
      data-company-row
      aria-selected={selected}
      draggable
      onMouseDown={(e) => {
        // Shift click extends the selection, not a text range.
        if (e.shiftKey) e.preventDefault();
      }}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest('button, a, input')) return;
        // Selecting the opener's text is not a click on the row.
        if (e.target instanceof Element && e.target.closest('[data-opener]') && window.getSelection()?.toString()) return;
        onSelect(company.id, e);
      }}
      onDragStart={(e) => onDragOut(company.id, e)}
      className={cn(
        COLUMNS,
        'group items-start gap-y-2 rounded-[20px] px-6 py-4 transition-colors duration-150',
        selected ? 'bg-primary/[0.09] dark:bg-primary/[0.16]' : 'hover:bg-foreground/[0.035]',
        selected && joinAbove && 'rounded-t-none',
        selected && joinBelow && 'rounded-b-none',
      )}
    >
        <div className="min-w-0 leading-5">
          <div className="truncate text-[14px] font-medium">{company.name}</div>
          <button
            type="button"
            onClick={() => void api.openExternal(company.website)}
            className="block max-w-full truncate rounded-sm text-left font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {company.domain}
          </button>
        </div>
        <EmailsCell company={company} live={live} />
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <div className="truncate">{company.location ?? source}</div>
          {company.phone && <div className="truncate tabular-nums">{company.phone}</div>}
        </div>
        <div className="-my-0.5 flex justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
          {company.emails.length > 1 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="size-6 text-muted-foreground"
                  aria-label="Copy all emails"
                  onClick={() =>
                    void copy(company.emails.map((e) => e.address).join(', '), `${company.emails.length} emails`)
                  }
                >
                  <Copy className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy all emails</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground"
                aria-label="Open website"
                onClick={() => void api.openExternal(company.website)}
              >
                <ExternalLink className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open website</TooltipContent>
          </Tooltip>
        </div>
        {opener && (
          <div className="col-span-3 min-w-0">
            <OpenerLine opener={opener} />
          </div>
        )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div>
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, 'px-6 py-5')}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="h-[18px] w-14 rounded-full" />
          </div>
          <Skeleton className="h-3 w-24" />
          <span />
        </div>
      ))}
    </div>
  );
}

/* Toolbar */

function VerificationFilter({
  value,
  onChange,
}: {
  value: Verification | undefined;
  onChange: (value: Verification | undefined) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
            value
              ? 'bg-primary/10 text-foreground dark:bg-primary/20'
              : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
          )}
        >
          {value && <span className={cn('size-1.5 rounded-full', VERIFICATION_DOT[value])} />}
          {value ? VERIFICATION_LABEL[value] : 'Any verification'}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Show emails that are</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? 'any'}
          onValueChange={(v) => onChange(v === 'any' ? undefined : (v as Verification))}
        >
          <DropdownMenuRadioItem value="any">Any verification</DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {VERIFICATION_ORDER.map((v) => (
            <DropdownMenuRadioItem key={v} value={v}>
              <span className={cn('size-1.5 rounded-full', VERIFICATION_DOT[v])} />
              {VERIFICATION_LABEL[v]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type KindOption = 'all' | EmailKind;

/* Screen */

export function SearchResultsScreen({ id, initialFilter = '' }: { id: string; initialFilter?: string }) {
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState(initialFilter);
  const [verification, setVerification] = useState<Verification | undefined>();
  const [kind, setKind] = useState<EmailKind | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
  const [editingMore, setEditingMore] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;
  const companies = useCompanies(id, { q: q || undefined, verification, kind }, live);
  useRefreshWhenFinished(live, id);
  const offline = offlineCaption(useLocalStatus().data);
  const cancel = useCancelSearch();
  const create = useCreateSearch();
  const draft = useDraftOpeners(id);
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [listTop, setListTop] = useState(0);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);

  const rows = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(q || verification || kind);
  const drafting = rows.some((r) => r.opener?.status === 'queued');
  const drafted = rows.some((r) => r.opener != null && r.opener.status !== 'queued');
  useFollowOpeners(id, drafting, live);

  // TanStack Virtual returns fresh functions each render; the compiler lint knows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // A row with an opener has a line under it; measureElement corrects the rest.
    estimateSize: (index) => (rows[index]?.opener ? 86 : 58),
    overscan: 12,
    getItemKey: (index) => rows[index]?.id ?? index,
    // The title and numbers scroll with the list, above it.
    scrollMargin: listTop,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = companies;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 25) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = (): void => setListTop(el.offsetTop);
    measure();
    const observer = new ResizeObserver(measure);
    if (el.parentElement) observer.observe(el.parentElement);
    return () => observer.disconnect();
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    // Other filters show other rows, so start the selection over.
    setSelection(EMPTY_SELECTION);
  }, [q, verification, kind]);

  const selected = pickSelected(rows, selection);

  function selectRow(rowId: string, event: ReactMouseEvent): void {
    const toggle = isMac ? event.metaKey : event.ctrlKey;
    setSelection((current) =>
      clickSelect(
        current,
        rows.map((r) => r.id),
        rowId,
        { toggle, range: event.shiftKey },
      ),
    );
  }

  /** Dragging a selected row takes the whole selection; any other row goes alone. */
  function dragOut(rowId: string, event: ReactDragEvent): void {
    event.preventDefault();
    const inSelection = selection.ids.has(rowId);
    const leads = inSelection ? selected : rows.filter((r) => r.id === rowId);
    if (!inSelection) setSelection({ ids: new Set([rowId]), anchor: rowId });
    if (leads.length === 0 || !search) return;
    const name =
      leads.length === 1 ? `${leads[0]!.domain}.csv` : csvFileName(search).replace(/\.csv$/, `-${leads.length}.csv`);
    api.startDragCsv(name, companiesToCsv(leads, { includeEmpty: true, bom: true }));
  }

  function copySelected(): void {
    if (selected.length === 0) return;
    const what = selected.length === 1 ? selected[0]!.name : `${formatNumber(selected.length)} companies`;
    void copy(companiesToTsv(selected), what);
  }

  // Cmd/Ctrl+C copies the selected rows, Cmd/Ctrl+A selects every loaded row,
  // Escape clears. Fields, dialogs and selected text keep their own behaviour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, [contenteditable="true"], [role="dialog"], [role="menu"]')) return;
      const mod = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && !event.altKey && !event.shiftKey && key === 'c') {
        if (selection.ids.size === 0 || (window.getSelection()?.toString() ?? '') !== '') return;
        event.preventDefault();
        copySelected();
      } else if (mod && !event.altKey && !event.shiftKey && key === 'a' && rows.length > 0) {
        event.preventDefault();
        setSelection({ ids: new Set(rows.map((r) => r.id)), anchor: rows[0]!.id });
      } else if (event.key === 'Escape' && selection.ids.size > 0 && !document.querySelector('[role="dialog"], [role="menu"]')) {
        setSelection(EMPTY_SELECTION);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The local copy answers at once; this checks it against the server behind it.
  useEffect(() => {
    if (!live) void api.refreshLocal(id);
  }, [id, live]);

  useModHotkey('f', () => {
    filterRef.current?.focus();
    filterRef.current?.select();
  });
  useModHotkey('e', requestExport, Boolean(search));

  /** Shows the outreach note first, unless the user has turned it off. */
  function requestExport(): void {
    if (!search || exporting || search.emailsFound === 0) return;
    if (shouldShowExportNotice()) setExportNotice(true);
    else void doExport();
  }

  async function doExport(): Promise<void> {
    if (!search || exporting) return;
    setExporting(true);
    try {
      const result = await api.exportCsv(search.id, csvFileName(search));
      if (result.saved) {
        toast.success(`Exported ${formatNumber(search.emailsFound)} emails`, {
          description: result.filePath,
        });
      } else if (result.error) {
        toast.error('Export failed', { description: result.error });
      }
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  /**
   * Queues openers for `companies` (the whole search when omitted). When
   * nothing was queued but some of them have one already, the toast offers
   * to draft those again.
   */
  function draftOpeners(companies?: Company[], redo = false): void {
    if (draft.isPending) return;
    const body: DraftOpenersInput = companies ? { companyIds: companies.map((c) => c.id), redo } : { redo };
    const asked = companies ?? rows;
    draft.mutate(body, {
      onSuccess: ({ queued, skipped }) => {
        const skippedLine = skipped > 0 ? `${formatNumber(skipped)} skipped: no valid email or already drafted.` : undefined;
        if (queued > 0) {
          toast.success(`Drafting ${formatNumber(queued)} ${queued === 1 ? 'opener' : 'openers'}`, { description: skippedLine });
          return;
        }
        const again = !redo && asked.some((c) => c.opener?.status === 'done');
        toast('Nothing to draft', {
          description: again
            ? 'These companies have an opener already, or no valid email.'
            : 'None of these companies has a valid email to write to.',
          action: again ? { label: 'Draft again', onClick: () => draftOpeners(companies, true) } : undefined,
        });
      },
      onError: (err) => toast.error('Couldn’t draft openers', { description: err.message }),
    });
  }

  function doCancel(): void {
    cancel.mutate(id, {
      onSuccess: () => toast('Search stopped', { description: 'Everything found so far is kept.' }),
      onError: (err) => toast.error('Couldn’t stop the search', { description: err.message }),
    });
  }

  /** Opens Search more in place, at the top where the editor sits. */
  function openSearchMore(): void {
    setEditingMore(true);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // A search that goes live again closes the editor, wherever the run came from.
  useEffect(() => {
    if (live) setEditingMore(false);
  }, [live]);

  /** Starts a fresh search with the same parameters and opens it. */
  function runAgain(): void {
    if (!search || create.isPending) return;
    const input = { kind: search.kind, params: search.params, limit: search.limit } as SearchInput;
    create.mutate(input, {
      onSuccess: (next) => {
        toast.success('Search started', { description: searchTitle(next) });
        navigate({ name: 'search', id: next.id }, { replace: true });
      },
      onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
    });
  }

  const back = <BackButton />;

  if (searchQuery.error) {
    const missing = searchQuery.error instanceof ApiError && searchQuery.error.status === 404;
    return (
      <>
        <PageHeader leading={back} />
        {missing ? (
          <EmptyState
            icon={SearchX}
            title="This search is gone"
            action={
              <Button variant="outline" onClick={() => navigate({ name: 'searches' })}>
                Back to searches
              </Button>
            }
          >
            Probably deleted on another device.
          </EmptyState>
        ) : (
          <ErrorState error={searchQuery.error} onRetry={() => void searchQuery.refetch()} />
        )}
      </>
    );
  }

  if (!search) {
    return (
      <>
        <PageHeader leading={back} />
        <div className="mx-auto w-full max-w-[1120px] px-8">
          <div className="px-6 pt-8 pb-10">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="mt-3 h-3.5 w-56" />
            <div className="mt-10 grid grid-cols-4 gap-8">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="flex flex-col gap-2.5">
                  <Skeleton className="h-9 w-16" />
                  <Skeleton className="h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
          <TableSkeleton />
        </div>
      </>
    );
  }

  const timing = search.startedAt
    ? `${relativeTime(search.createdAt)}, ${live ? 'running for' : 'took'} ${duration(search.startedAt, search.finishedAt)}`
    : relativeTime(search.createdAt);

  return (
    <>
      <PageHeader
        leading={back}
        actions={
          <>
            {live && (
              <Button variant="glass" size="sm" className="h-9 px-4" onClick={doCancel} disabled={cancel.isPending}>
                <Ban />
                Stop
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="glass" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {search.kind === 'drop' ? (
                  <DropdownMenuItem onSelect={() => navigate({ name: 'drop', id: search.params.dropId })}>
                    <Inbox />
                    Open drop
                  </DropdownMenuItem>
                ) : (
                  <>
                    <DropdownMenuItem onSelect={openSearchMore} disabled={live}>
                      <ListPlus />
                      Search more
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={runAgain} disabled={live || create.isPending}>
                      <RotateCw />
                      Run again
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuItem onSelect={requestExport} disabled={search.emailsFound === 0}>
                  <Download />
                  Export CSV
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => draftOpeners()} disabled={search.emailsValid === 0 || draft.isPending}>
                  <PenLine />
                  Draft openers
                </DropdownMenuItem>
                {drafted && (
                  <DropdownMenuItem onSelect={() => draftOpeners(undefined, true)} disabled={draft.isPending}>
                    <RotateCw />
                    Draft openers again
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete search
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div
        ref={scrollRef}
        onClick={(e) => {
          if (!(e.target instanceof Element && e.target.closest('[data-company-row], button, a, input'))) setSelection(EMPTY_SELECTION);
        }}
        className="fade-edges min-h-0 flex-1 overflow-auto px-8 pb-32 [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1120px]">
          <Overview
            search={search}
            timing={timing}
            onRunAgain={runAgain}
            starting={create.isPending}
            editing={editingMore}
            onSearchMore={openSearchMore}
            onCloseMore={() => setEditingMore(false)}
          />

          <div>
            <div className={cn(COLUMNS, 'px-6 py-2 text-xs text-muted-foreground')}>
              <span>Company</span>
              <span className="flex items-center gap-1.5">
                Emails
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About these emails"
                      className="rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Info className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72 rounded-2xl px-3 py-2 leading-relaxed">
                    Public addresses from each company's own website. Many EU countries require prior consent for
                    marketing email, even to businesses. Results are deleted 12 months after the search.
                  </TooltipContent>
                </Tooltip>
              </span>
              <span>{search.kind === 'local' ? 'Location' : 'Found on'}</span>
              <span />
            </div>
          </div>

          <div ref={listRef}>
            {companies.isPending ? (
              <TableSkeleton />
            ) : companies.error ? (
              <ErrorState error={companies.error} onRetry={() => void companies.refetch()} />
            ) : rows.length === 0 ? (
              filtered ? (
                <EmptyState
                  icon={SearchX}
                  title="Nothing matches these filters"
                  action={
                    <Button
                      variant="outline"
                      onClick={() => {
                        setText('');
                        setVerification(undefined);
                        setKind(undefined);
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : live ? (
                <EmptyState icon={Radar} title="Looking for companies">
                  They show up here the moment we find them.
                </EmptyState>
              ) : editingMore ? null : (
                <EmptyState
                  icon={Inbox}
                  title="No companies found"
                  action={
                    canSearchMore(search) ? (
                      <Button variant="outline" onClick={openSearchMore}>
                        <ListPlus />
                        Search more
                      </Button>
                    ) : undefined
                  }
                >
                  {search.status === 'failed' ? 'It stopped before finding any.' : 'Widen it and search again: what it finds lands here.'}
                </EmptyState>
              )
            ) : (
              <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
                {items.map((item) => (
                  <div
                    key={item.key}
                    data-index={item.index}
                    ref={virtualizer.measureElement}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${item.start - virtualizer.options.scrollMargin}px)` }}
                  >
                    <CompanyRow
                      company={rows[item.index]!}
                      live={live}
                      selected={selection.ids.has(rows[item.index]!.id)}
                      joinAbove={item.index > 0 && selection.ids.has(rows[item.index - 1]!.id)}
                      joinBelow={selection.ids.has(rows[item.index + 1]?.id ?? '')}
                      onSelect={selectRow}
                      onDragOut={dragOut}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The dock: filters and export float over the list, in glass. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-8">
        {selected.length > 0 && (
          <div
            data-selection-bar
            className="glass pointer-events-auto flex h-9 items-center gap-3 rounded-full pr-1.5 pl-4 text-xs motion-safe:animate-rise"
          >
            <span className="font-medium tabular-nums">
              {selected.length === 1 ? '1 company' : `${formatNumber(selected.length)} companies`} selected
            </span>
            <span className="text-muted-foreground">
              Drag into Excel, Outlook or a folder, or <Kbd className="bg-transparent">{modKey} C</Kbd> to copy
            </span>
            <button
              type="button"
              data-draft-selected
              onClick={() => draftOpeners(selected)}
              disabled={draft.isPending}
              className="flex h-6 items-center gap-1.5 rounded-full px-2.5 font-medium outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <PenLine className="size-3.5" />
              Draft openers
            </button>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => setSelection(EMPTY_SELECTION)}
              className="flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        <div className="glass pointer-events-auto flex h-12 items-center gap-1 rounded-full pr-1.5 pl-1.5 motion-safe:animate-rise">
          <div className="relative w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={filterRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setText('');
                  e.currentTarget.blur();
                }
              }}
              placeholder="Filter companies and emails"
              aria-label="Filter companies and emails"
              className="h-9 w-full rounded-full bg-foreground/[0.045] pr-12 pl-9 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
            {text ? (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setText('')}
                className="absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/40 text-background hover:bg-muted-foreground/60"
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
            ) : (
              <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 bg-transparent">{modKey} F</Kbd>
            )}
          </div>
          <VerificationFilter value={verification} onChange={setVerification} />
          <Segmented<KindOption>
            label="Email kind"
            size="sm"
            value={kind ?? 'all'}
            onChange={(v) => setKind(v === 'all' ? undefined : v)}
            className="bg-transparent"
            options={[
              { value: 'all', label: 'All' },
              { value: 'generic', label: 'Generic' },
              { value: 'personal', label: 'Personal' },
            ]}
          />
          <span className="flex min-w-24 items-center justify-end gap-1.5 px-3 text-xs tabular-nums text-muted-foreground">
            {offline ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span data-offline className="flex items-center" aria-label={offline}>
                    <CloudOff className="size-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 rounded-2xl px-3 py-2 leading-relaxed">
                  {offline}. Filtering runs on the copy on this computer.
                </TooltipContent>
              </Tooltip>
            ) : (
              companies.isPlaceholderData && <Loader2 className="size-3 motion-safe:animate-spin" />
            )}
            {companies.data &&
              (filtered
                ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)}`
                : `${formatNumber(total)} companies`)}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={requestExport} disabled={exporting || search.emailsFound === 0}>
                {exporting ? <Loader2 className="motion-safe:animate-spin" /> : <Download />}
                Export CSV
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              One row per email <Kbd>{modKey} E</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <ExportNoticeDialog open={exportNotice} onOpenChange={setExportNotice} onExport={() => void doExport()} />

      <DeleteSearchDialog
        search={search}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={() => navigate({ name: 'searches' }, { replace: true })}
      />
    </>
  );
}
