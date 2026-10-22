import { useEffect, useLayoutEffect, useRef, useState, type DragEvent as ReactDragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Ban,
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
  Play,
  RotateCw,
  SearchX,
  Search as SearchIcon,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { BackButton, PageHeader, Panel } from '@/components/AppShell';
import { SonarMark } from '@/components/SonarMark';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { ExportNoticeDialog } from '@/components/ExportNoticeDialog';
import { StatusLabel, VerificationBadge } from '@/components/indicators';
import { SearchDisplay, SearchDisplaySkeleton } from '@/components/SearchDisplay';
import { SearchWorking } from '@/components/SearchWorking';
import { canSearchMore, continueInput, fewFoundLine, RunsLine, SearchMoreEditor } from '@/components/SearchMore';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
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
} from '@/lib/format';
import { isMac, modKey, useModHotkey } from '@/lib/hotkeys';
import {
  useCancelSearch,
  useCheckInboxes,
  useCompanies,
  useCreateSearch,
  useDraftOpeners,
  useFollowInboxChecks,
  useFollowOpeners,
  useLocalStatus,
  useMe,
  useRefreshWhenFinished,
  useSearch,
  useSearchMore,
  useUpdateSearch,
  useUpdatingSearch,
} from '@/lib/queries';
import {
  fitLabel,
  foundViaHint,
  foundViaLabel,
  emailsLeft,
  inboxChecking,
  inboxCost,
  INBOX_FOLLOW_MS,
  isDecisionMakerEmail,
  isPersonEmail,
  personName,
  SHARED_INBOXES,
  shownEmails,
} from '@/lib/people';
import { navigate } from '@/lib/router';
import { clickSelect, EMPTY_SELECTION, pickSelected, type Selection } from '@/lib/selection';
import type { Company, DraftOpenersInput, Email, Opener, Search, SearchInput } from '@/lib/types';
import { useDesktopSettings } from '@/lib/desktop';
import { handsToLocalCrawl } from '@nvoke/shared';
import { cn } from '@/lib/utils';
import { RevealWords } from '@/components/Reveal';

const COLUMNS = 'grid grid-cols-[minmax(11rem,0.9fr)_minmax(21rem,2fr)_minmax(7rem,0.55fr)_4rem] gap-6';

/** Labels for Company.source, as the server's source adapters set it. */
const SOURCE_LABEL: Record<string, string> = {
  osm: 'OpenStreetMap',
  brave: 'Web search',
  product_hunt: 'Product Hunt',
  show_hn: 'Show HN',
};

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

function Overview({
  search,
  timing,
  onRunAgain,
  starting,
  onContinue,
  continuing,
  editing,
  onSearchMore,
  onCloseMore,
}: {
  search: Search;
  timing: string;
  onRunAgain: () => void;
  starting: boolean;
  /** Picks a stopped search up where it left off: the rest of its limit, into the same list. */
  onContinue: () => void;
  continuing: boolean;
  /** Search more is open in place of the numbers. */
  editing: boolean;
  onSearchMore: () => void;
  onCloseMore: () => void;
}) {
  const few = fewFoundLine(search);
  return (
    <section className="px-6 pt-8 pb-10">
      {search.kind === 'icp' && <SonarMark weight className="mb-3" />}
      <h1 className="font-display text-3xl font-light tracking-[-0.02em] text-balance">
        <RevealWords text={searchTitle(search)} />
      </h1>
      <div className="cap mt-2 flex items-center gap-2.5 text-muted-foreground">
        <StatusLabel status={search.status} />
        <span className="truncate" title={`${searchSubtitle(search)}, ${timing}`}>
          {searchSubtitle(search)}, {timing}
        </span>
      </div>
      <RunsLine search={search} />
      {editing && canSearchMore(search) ? (
        <SearchMoreEditor search={search} onClose={onCloseMore} />
      ) : (
        <>
          <SearchDisplay search={search} className="mt-8" />
          {/* A search the quota stopped cannot go on; the failed banner says why. */}
          {search.kind === 'icp' && search.error !== 'quota_exceeded' && <OngoingSwitch search={search} />}
          {canSearchMore(search) && search.status !== 'failed' && (
            <div className="mt-8 flex items-center gap-4">
              {continueInput(search) && (
                <Button onClick={onContinue} disabled={continuing}>
                  <Play />
                  Continue
                </Button>
              )}
              <Button variant="secondary" onClick={onSearchMore}>
                <ListPlus />
                Search more
              </Button>
              {few && <span className="text-sm text-muted-foreground">{few}</span>}
            </div>
          )}
          {search.status === 'failed' && (
            <div className="mt-8 flex items-center gap-3 rounded-[4px] border-t border-b border-destructive/40 bg-destructive/8 px-4 py-3 text-sm">
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

/**
 * "Keeps finding new leads": a plain words search goes on after its first
 * run, adding new companies until switched off (`PATCH /v1/searches/:id`).
 */
function OngoingSwitch({ search }: { search: Search }) {
  const update = useUpdateSearch();
  // Also off while New search's own switch is still on its way.
  const saving = useUpdatingSearch(search.id);
  const on = Boolean(search.ongoing);
  const active = isActive(search.status);
  // A stopped search goes on from where it was once the switch is back on.
  const stopped = search.status === 'canceled';
  const line = on
    ? active
      ? 'When this run ends, nvoke keeps looking and adds new people as it finds them.'
      : 'nvoke looks for new companies a few times a day and adds the people it finds here.'
    : stopped
      ? 'Off. Continue picks it up where it stopped.'
      : 'Off. The list stays as it is.';
  const set = (ongoing: boolean): void =>
    update.mutate(
      { id: search.id, ongoing },
      { onSuccess: () => toast(ongoing ? (stopped ? 'Continuing' : 'Keeps finding new leads') : 'Stopped looking for new leads') },
    );
  return (
    <div className="mt-8 flex items-center gap-4">
      {stopped && !on && (
        <Button onClick={() => set(true)} disabled={saving}>
          <Play />
          Continue
        </Button>
      )}
      <label data-ongoing className="flex min-w-0 cursor-pointer items-center gap-3.5">
        <Switch checked={on} disabled={saving} onCheckedChange={set} />
        <span className="shrink-0 text-sm font-medium">Keeps finding new leads</span>
        <span className="min-w-0 truncate text-sm text-muted-foreground" title={line}>
          {line}
        </span>
      </label>
    </div>
  );
}

/* Rows */

function AddressButton({ email }: { email: Email }) {
  return (
    <button
      type="button"
      data-copy-email
      onClick={() => void copy(email.address, email.address)}
      className="group/email flex min-w-0 items-center gap-1.5 rounded-sm text-left font-mono text-xs text-foreground/80 outline-none hover:text-primary dark:text-foreground/65 dark:hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
      title="Copy email"
    >
      <span className="truncate">{email.address}</span>
      <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/email:opacity-60" />
    </button>
  );
}

/** How nvoke got the address, quiet, with the long version on hover. */
function FoundVia({ email }: { email: Email }) {
  const label = foundViaLabel(email);
  if (!label) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span data-found-via={email.foundVia} className="shrink-0 cursor-default text-2xs text-muted-foreground">
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 px-3 py-2 leading-relaxed">{foundViaHint(email)}</TooltipContent>
    </Tooltip>
  );
}

/** A named person: name, title and a quiet badge for decision makers, then the address and how it was found. */
function PersonLine({ email, checking }: { email: Email; checking: boolean }) {
  const name = personName(email);
  const title = email.person?.title ?? null;
  const badge = <VerificationBadge value={email.verification ?? 'unknown'} pending={checking && email.verification === null} />;
  if (!name) {
    // An address that reads as a person, with no name to it (older copies).
    return (
      <div data-person className="flex min-w-0 items-center gap-2">
        <AddressButton email={email} />
        <FoundVia email={email} />
        <span className="ml-auto" />
        {badge}
      </div>
    );
  }
  return (
    <div data-person className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-baseline gap-2 leading-5">
        <span className="shrink-0 text-[13px] font-medium">{name}</span>
        {title && (
          <span className="min-w-0 truncate text-xs text-muted-foreground" title={title}>
            {title}
          </span>
        )}
        {isDecisionMakerEmail(email) && (
          <Badge data-decision-maker className="shrink-0 self-center">
            Decision maker
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <AddressButton email={email} />
        <FoundVia email={email} />
        <span className="ml-auto" />
        {badge}
      </div>
    </div>
  );
}

/** A shared inbox (info@, sales@): shown where the company has no person, or when asked for. */
function InboxLine({ email, checking }: { email: Email; checking: boolean }) {
  return (
    <div data-inbox className="flex min-w-0 items-center gap-2">
      <AddressButton email={email} />
      <span className="shrink-0 text-2xs text-muted-foreground">{SHARED_INBOXES.label}</span>
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

/** A read company with no person on the list, and the way to its shared inboxes when they are off. */
function NoPersonLine({ company, onCheckInboxes }: { company: Company; onCheckInboxes: (() => void) | null }) {
  return (
    <span data-no-person className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs leading-5 text-muted-foreground">
      {SHARED_INBOXES.noPerson}
      {onCheckInboxes && (
        <button
          type="button"
          onClick={onCheckInboxes}
          aria-label={`${SHARED_INBOXES.short} for this search, ${company.name} included`}
          className="rounded-sm font-medium text-foreground/75 underline-offset-4 outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {SHARED_INBOXES.short}
        </button>
      )}
    </span>
  );
}

function PeopleCell({
  company,
  live,
  showInboxes,
  narrowed,
  onCheckInboxes,
}: {
  company: Company;
  live: boolean;
  showInboxes: boolean;
  /** An email filter is on, so the emails here are only the ones that passed it. */
  narrowed: boolean;
  /** Switches on the search's shared inboxes; null when they are on already. */
  onCheckInboxes: (() => void) | null;
}) {
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
  // Read, nothing named, but a shared inbox skipped or still checking: it is there, just not shown.
  const skipped = company.inboxesSkipped ?? 0;
  if (company.emails.length === 0 && skipped + (company.inboxesPending ?? 0) > 0) {
    return <NoPersonLine company={company} onCheckInboxes={skipped > 0 ? onCheckInboxes : null} />;
  }
  if (company.emails.length === 0 && handsToLocalCrawl(company.crawlStatus, 0) && company.localCrawl !== 'done') {
    return <LocalCrawlLine company={company} />;
  }
  if (company.emails.length === 0) return <span className={quiet}>No public email</span>;
  const shown = shownEmails(company, showInboxes);
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {shown.emails.map((e) =>
        isPersonEmail(e) ? <PersonLine key={e.id} email={e} checking={live} /> : <InboxLine key={e.id} email={e} checking={live} />,
      )}
      {/* Under a filter the people may only have been filtered out, so no claim then. */}
      {shown.fallback && !narrowed && <span className="-mt-1 text-2xs text-muted-foreground/80">{SHARED_INBOXES.noPerson}</span>}
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
          className="flex size-5 items-center justify-center rounded-[3px] text-muted-foreground opacity-0 outline-none transition-opacity group-hover/opener:opacity-100 hover:text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Copy className="size-3" />
        </button>
        {sourceUrl && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-link
                onClick={() => void api.openExternal(sourceUrl)}
                className="max-w-40 truncate rounded-sm text-left text-2xs leading-5 text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                from <span className="font-mono">{sourcePath(sourceUrl)}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-72 px-3 py-2 leading-relaxed">
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
  entering,
  showInboxes,
  narrowed,
  onCheckInboxes,
  selected,
  joinAbove,
  joinBelow,
  onSelect,
  onDragOut,
}: {
  company: Company;
  live: boolean;
  /** Its place in the cascade while it comes in (the first paint, or rows that just arrived), else null. */
  entering: number | null;
  showInboxes: boolean;
  narrowed: boolean;
  onCheckInboxes: (() => void) | null;
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
      style={entering === null ? undefined : { animationDelay: `${entering * 28}ms` }}
      className={cn(
        COLUMNS,
        // A hairline row on the chassis; a selected run drops the hairlines inside it so it reads as one block.
        'group items-start gap-y-2 border-t border-border px-6 py-4 transition-colors duration-150',
        entering !== null && 'motion-safe:animate-item-in',
        selected ? 'bg-primary/[0.09] dark:bg-primary/[0.16]' : 'hover:bg-foreground/[0.035]',
        selected && joinAbove && 'border-t-transparent',
        selected && joinBelow && 'border-b-transparent',
      )}
    >
        <div className="min-w-0 leading-5">
          <div className="truncate text-[15px]" title={company.name}>
            {company.name}
          </div>
          <button
            type="button"
            data-link
            title={company.website}
            onClick={() => void api.openExternal(company.website)}
            className="block max-w-full truncate rounded-sm text-left font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {company.domain}
          </button>
          {company.fit != null && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span data-fit className="cap mt-1.5 inline-flex cursor-default items-center gap-1.5 text-muted-foreground">
                  <span className="h-[3px] w-10 overflow-hidden rounded-[1px] bg-foreground/10">
                    <span className="block h-full bg-foreground/45" style={{ width: `${company.fit}%` }} />
                  </span>
                  {fitLabel(company.fit)}
                </span>
              </TooltipTrigger>
              <TooltipContent>Fit {company.fit} of 100, judged from the company’s own site</TooltipContent>
            </Tooltip>
          )}
        </div>
        <PeopleCell company={company} live={live} showInboxes={showInboxes} narrowed={narrowed} onCheckInboxes={onCheckInboxes} />
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <div className="truncate" title={company.location ?? source}>
            {company.location ?? source}
          </div>
          {company.phone && (
            <div className="truncate tabular-nums" title={company.phone}>
              {company.phone}
            </div>
          )}
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
            <Skeleton className="h-[18px] w-14 rounded-[3px]" />
          </div>
          <Skeleton className="h-3 w-24" />
          <span />
        </div>
      ))}
    </div>
  );
}

/* Toolbar */

/** A filter that is on or off: a keycap in the key bar whose LED lights when on. */
function FilterKey({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="key inline-flex h-8 shrink-0 items-center gap-2 bg-secondary px-3.5 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-secondary-foreground uppercase outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span aria-hidden className={cn('led', on && 'led-on')} />
      {children}
    </button>
  );
}

/** The longest a row's entrance runs: twelve steps of the cascade plus the rise itself. */
const ENTRANCE_MS = 12 * 28 + 420;

/**
 * Rows coming in, by id, with their place in the cascade. The first rows
 * cascade when the list first shows and again when a filter brings a new
 * set. While the search runs, only rows that just arrived come in, so the
 * results stream instead of the whole list replaying on each poll. Rows that
 * only scroll back into view stay still: the map clears once the rise is done.
 */
function useEnteringRows(rows: Company[], live: boolean, filterKey: string, waiting: boolean): Map<string, number> {
  const seen = useRef<Set<string> | null>(null);
  const shownFor = useRef(filterKey);
  const [entering, setEntering] = useState<Map<string, number>>(() => new Map());
  const ids = rows.map((r) => r.id).join(',');
  useEffect(() => {
    // The previous filter's rows stay up while the next set loads.
    if (waiting) return;
    const list = ids ? ids.split(',') : [];
    if (shownFor.current !== filterKey) {
      shownFor.current = filterKey;
      seen.current = null;
    }
    let next: string[];
    if (seen.current === null) {
      if (list.length === 0) return;
      seen.current = new Set(list);
      next = list.slice(0, 12);
    } else {
      const known = seen.current;
      next = live ? list.filter((id) => !known.has(id)) : [];
      for (const id of list) known.add(id);
    }
    if (next.length > 0) setEntering(new Map(next.map((id, i) => [id, Math.min(i, 12)])));
  }, [ids, live, filterKey, waiting]);
  useEffect(() => {
    if (entering.size === 0) return;
    const timer = setTimeout(() => setEntering(new Map()), ENTRANCE_MS);
    return () => clearTimeout(timer);
  }, [entering]);
  return entering;
}

/* Screen */

export function SearchResultsScreen({ id, initialFilter = '' }: { id: string; initialFilter?: string }) {
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState(initialFilter);
  const [decisionMakers, setDecisionMakers] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [showInboxes, setShowInboxes] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
  const [editingMore, setEditingMore] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;
  const companies = useCompanies(
    id,
    { q: q || undefined, verification: verifiedOnly ? 'valid' : undefined, decisionMakers: decisionMakers || undefined },
    live,
  );
  useRefreshWhenFinished(live, id);
  const offline = offlineCaption(useLocalStatus().data);
  const cancel = useCancelSearch();
  const create = useCreateSearch();
  const more = useSearchMore(id);
  const draft = useDraftOpeners(id);
  const checkInboxes = useCheckInboxes();
  const left = emailsLeft(useMe().data);
  // When the screen asked for the shared inbox checks it follows, until none is pending or INBOX_FOLLOW_MS passed.
  const [inboxesSince, setInboxesSince] = useState<number | null>(null);
  const inboxesFollowing = inboxesSince !== null && Boolean(search?.checkInboxes) && search?.inboxesPending !== 0;
  useFollowInboxChecks(id, inboxesFollowing ? inboxesSince : null, live);
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [listTop, setListTop] = useState(0);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);

  const rows = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(q || verifiedOnly || decisionMakers);
  const entering = useEnteringRows(
    rows,
    live,
    `${q}|${verifiedOnly}|${decisionMakers}`,
    companies.isPending || companies.isPlaceholderData,
  );
  const drafting = rows.some((r) => r.opener?.status === 'queued');
  const drafted = rows.some((r) => r.opener != null && r.opener.status !== 'queued');
  useFollowOpeners(id, drafting, live);

  // TanStack Virtual returns fresh functions each render; the compiler lint knows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    // About 40px a person, more with an opener under it; measureElement corrects the rest.
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return 58;
      const lines = Math.max(1, shownEmails(row, showInboxes).emails.length);
      return 18 + lines * 40 + (row.opener ? 28 : 0);
    },
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
  }, [q, verifiedOnly, decisionMakers]);

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
  // A stopped search goes on from where it was: the rest of its limit joins this list.
  function continueSearch(): void {
    if (!search || more.isPending) return;
    const input = continueInput(search);
    if (!input) return;
    more.mutate(input, {
      onSuccess: () => toast.success('Continuing', { description: `${formatNumber(input.limit ?? 0)} more into this list` }),
      onError: (err) => {
        const quota = err instanceof ApiError && err.code === 'quota_exceeded';
        toast.error('Couldn’t continue', {
          description: err.message,
          action: quota ? { label: 'Upgrade', onClick: () => void api.openExternal(BILLING_URL) } : undefined,
        });
      },
    });
  }

  function runAgain(): void {
    if (!search || create.isPending) return;
    const input = {
      kind: search.kind,
      params: search.params,
      limit: search.limit,
      ...(search.checkInboxes ? { checkInboxes: true } : {}),
    } as SearchInput;
    create.mutate(input, {
      onSuccess: (next) => {
        toast.success('Search started', { description: searchTitle(next) });
        navigate({ name: 'search', id: next.id }, { replace: true });
      },
      onError: (err) => toast.error('Couldn’t start the search', { description: err.message }),
    });
  }

  /** Switches on the search's shared inboxes, shows them and follows their checks as they settle. */
  function startInboxChecks(): void {
    if (checkInboxes.isPending) return;
    checkInboxes.mutate(
      { id },
      {
        onSuccess: () => {
          setShowInboxes(true);
          setInboxesSince(Date.now());
        },
        onError: (err) => toast.error(SHARED_INBOXES.failed, { description: err.message }),
      },
    );
  }

  // The follow ends after INBOX_FOLLOW_MS even when some check is still waiting.
  useEffect(() => {
    if (inboxesSince === null) return;
    const t = setTimeout(() => setInboxesSince(null), Math.max(0, inboxesSince + INBOX_FOLLOW_MS - Date.now()));
    return () => clearTimeout(t);
  }, [inboxesSince]);

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
            <SearchDisplaySkeleton className="mt-8" />
          </div>
          <TableSkeleton />
        </div>
      </>
    );
  }

  const timing = search.startedAt
    ? `${relativeTime(search.createdAt)}, ${live ? 'running for' : 'took'} ${duration(search.startedAt, search.finishedAt)}`
    : relativeTime(search.createdAt);
  const inboxesOff = !search.checkInboxes;

  return (
    <>
      <PageHeader
        leading={back}
        actions={
          <>
            {live && (
              <Button variant="destructive" onClick={doCancel} disabled={cancel.isPending}>
                <Ban />
                Stop
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
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

      <Panel
        ref={scrollRef}
        onClick={(e) => {
          if (!(e.target instanceof Element && e.target.closest('[data-company-row], button, a, input'))) setSelection(EMPTY_SELECTION);
        }}
        className="px-8 pb-32 [scrollbar-gutter:stable]"
      >
        <div className="mx-auto w-full max-w-[1120px]">
          <Overview
            search={search}
            timing={timing}
            onRunAgain={runAgain}
            starting={create.isPending}
            onContinue={continueSearch}
            continuing={more.isPending}
            editing={editingMore}
            onSearchMore={openSearchMore}
            onCloseMore={() => setEditingMore(false)}
          />

          <div>
            <div className={cn(COLUMNS, 'cap px-6 py-2 text-muted-foreground')}>
              <span>Company</span>
              <span className="flex items-center gap-1.5">
                People
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="About these people"
                      className="rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <Info className="size-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-72 px-3 py-2 leading-relaxed">
                    Decision makers first. Names and titles come from each company’s own site. An address is printed there, or
                    built from the domain’s pattern and checked with its mail server. A shared inbox (sales@, info@) is checked
                    only where no person is reachable. Many EU countries require prior consent for marketing email, even to businesses. Results are deleted
                    12 months after the search.
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
                        setVerifiedOnly(false);
                        setDecisionMakers(false);
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              ) : live ? (
                <SearchWorking search={search} />
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
                      live={live || inboxesFollowing}
                      entering={entering.get(rows[item.index]!.id) ?? null}
                      showInboxes={showInboxes}
                      narrowed={verifiedOnly || decisionMakers}
                      onCheckInboxes={inboxesOff ? startInboxChecks : null}
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
      </Panel>

      {/* The key bar: filters and export on a plate over the list, with the notices on plates above it. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex flex-col items-center gap-2 px-8">
        {selected.length > 0 && (
          <div
            data-selection-bar
            className="glass pointer-events-auto flex h-9 items-center gap-3 rounded-[6px] pr-1.5 pl-4 text-xs motion-safe:animate-rise"
          >
            <span className="cap tabular-nums">
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
              className="cap flex h-6 items-center gap-1.5 rounded-[4px] px-2.5 outline-none hover:bg-foreground/[0.06] focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <PenLine className="size-3.5" />
              Draft openers
            </button>
            <button
              type="button"
              aria-label="Clear selection"
              onClick={() => setSelection(EMPTY_SELECTION)}
              className="flex size-6 items-center justify-center rounded-[4px] text-muted-foreground outline-none hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {showInboxes && inboxesOff && (
          <div
            data-inbox-notice
            className="glass pointer-events-auto flex max-w-[640px] items-center gap-4 rounded-[6px] py-3 pr-3 pl-5 motion-safe:animate-rise"
          >
            <div className="min-w-0 leading-5">
              <div className="text-sm font-medium">{SHARED_INBOXES.title}</div>
              <div className="text-xs text-muted-foreground">{SHARED_INBOXES.body}</div>
              <div data-inbox-cost className="mt-1 text-xs text-foreground/80">
                {inboxCost(search.inboxesSkipped, left)}
              </div>
            </div>
            <Button size="sm" className="shrink-0" onClick={startInboxChecks} disabled={checkInboxes.isPending}>
              {checkInboxes.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <Inbox />}
              {SHARED_INBOXES.action}
            </Button>
          </div>
        )}
        {inboxesFollowing && (
          <div
            data-inbox-checking
            role="status"
            aria-live="polite"
            className="glass pointer-events-auto flex h-9 items-center gap-2 rounded-[6px] px-4 text-xs text-muted-foreground motion-safe:animate-rise"
          >
            <Loader2 className="size-3.5 text-primary motion-safe:animate-spin" aria-hidden />
            {inboxChecking(search.inboxesPending)}
          </div>
        )}
        {/* A flat plate in the chassis colour with a hairline, deeper at the top so the keys' LEDs have room. */}
        <div className="pointer-events-auto flex items-center gap-2.5 rounded-[6px] bg-background px-3 pt-4 pb-3 shadow-[0_-16px_20px_-8px_var(--background),0_0_0_1px_var(--border)] motion-safe:animate-rise">
          <div className="relative w-60">
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
              placeholder="Filter people"
              aria-label="Filter people and companies"
              spellCheck={false}
              autoComplete="off"
              className="h-8 w-full rounded-[4px] bg-card pr-12 pl-9 font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none transition-[background-color,box-shadow] duration-150 placeholder:tracking-[0.08em] placeholder:text-muted-foreground/90 placeholder:uppercase focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            {text ? (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setText('')}
                className="absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-[2px] bg-muted-foreground/40 text-background outline-none hover:bg-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
            ) : (
              <Kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 bg-transparent">{modKey} F</Kbd>
            )}
          </div>
          <FilterKey on={decisionMakers} onChange={setDecisionMakers}>
            Decision makers
          </FilterKey>
          <FilterKey on={verifiedOnly} onChange={setVerifiedOnly}>
            Verified
          </FilterKey>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex">
                <FilterKey on={showInboxes} onChange={setShowInboxes}>
                  {SHARED_INBOXES.pill}
                </FilterKey>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-60 px-3 py-2 leading-relaxed">
              {inboxesOff ? SHARED_INBOXES.title : showInboxes ? SHARED_INBOXES.hintOn : SHARED_INBOXES.hintOff}
            </TooltipContent>
          </Tooltip>
          <span className="cap flex min-w-24 items-center justify-end gap-1.5 px-3 tabular-nums text-muted-foreground">
            {offline ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span data-offline className="flex items-center" aria-label={offline}>
                    <CloudOff className="size-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-64 px-3 py-2 leading-relaxed">
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
