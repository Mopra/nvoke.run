'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Ban,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  Info,
  Loader2,
  MoreHorizontal,
  PenLine,
  Plus,
  Radar,
  RefreshCw,
  Repeat,
  RotateCw,
  Search as SearchIcon,
  SearchX,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Company, CreateSearchInput, DraftOpenersInput, Email, Opener, Search } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { ExportNoticeDialog } from '@/components/app/export-notice-dialog';
import { StatusLabel, VerificationBadge } from '@/components/app/indicators';
import { copy, PEOPLE_COLUMNS, PeopleSkeleton, PersonRowView } from '@/components/app/people-list';
import { Pill } from '@/components/app/sentence';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { FoundFewNote, RunsLine, SearchMorePanel } from '@/components/app/search-more';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, isQuotaError } from '@/lib/app/api';
import {
  csvFileName,
  duration,
  errorMessage,
  formatNumber,
  emailsLeft,
  inboxChecking,
  inboxCost,
  INBOX_FOLLOW_MS,
  isActive,
  relativeTime,
  searchSubtitle,
  searchTitle,
  SHARED_INBOXES,
  shouldShowExportNotice,
} from '@/lib/app/desktop';
import {
  canBeOngoing,
  countsLine,
  filterCompanies,
  peopleCounts,
  peopleRows,
  personName,
  stageLine,
  type PeopleCounts,
  type PeopleFilters,
} from '@/lib/app/icp';
import { canDraftOpener, openerSourceLabel, openersNotice } from '@/lib/app/openers';
import { BILLING_PATH, stoppedByQuota } from '@/lib/app/quota';
import {
  useApi,
  useCancelSearch,
  useCompanies,
  useCreateSearch,
  useDraftOpeners,
  useFollowInboxChecks,
  useMe,
  useRefreshWhenFinished,
  useSearch,
  useUpdateSearch,
} from '@/lib/app/queries';
import { canSearchMore, foundFew } from '@/lib/app/search-form';
import { cn } from '@/lib/utils';

const COLUMNS = 'md:grid md:grid-cols-[minmax(10rem,1fr)_minmax(17rem,1.6fr)_minmax(7rem,0.6fr)_3.5rem] md:gap-6';

/** Labels for Company.source, as the server's source adapters set it. */
const SOURCE_LABEL: Record<string, string> = {
  osm: 'OpenStreetMap',
  brave: 'Web search',
  product_hunt: 'Product Hunt',
  show_hn: 'Show HN',
  list: 'Your list',
};


/** Hands a downloaded file to the browser's save flow. */
function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-extralight tabular-nums sm:text-4xl">{value}</span>
        {sub && <span className="truncate text-sm tabular-nums text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

/**
 * The live line: what the search is doing in its own words, the people found
 * so far, and the bar while it runs. Shown while it runs or keeps filling.
 */
function LiveLine({ search, counts, partial }: { search: Search; counts: PeopleCounts | null; partial: boolean }) {
  const active = isActive(search.status);
  const note = stageLine(search) ?? (active ? progressCaption(search) : 'Watching for new companies');
  return (
    <div className="mt-10" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="relative mt-[11px] flex size-2 shrink-0">
          {active && <span className="absolute inset-0 rounded-full bg-primary opacity-60 motion-safe:animate-ping" />}
          <span className={cn('relative size-2 rounded-full', active ? 'bg-primary' : 'bg-primary/50')} />
        </span>
        <div className="min-w-0">
          <p className="font-display text-xl/[30px] font-medium tracking-[-0.02em] text-pretty sm:text-2xl/[34px]">{note}</p>
          {counts && <p className="mt-1 text-sm tabular-nums text-muted-foreground">{countsLine(counts, partial)} so far</p>}
        </div>
      </div>
      {active && (
        <div className="mt-6">
          <div className="flex items-center gap-5">
            <SearchProgress search={search} className="h-[3px] flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            New people show up here as they’re found. Every address is checked with its own mail server, so the badges fill
            in over a few minutes. Close the tab if you like: the search keeps running.
          </p>
        </div>
      )}
    </div>
  );
}

/** Keep finding new leads, on a plain words search. */
function OngoingSwitch({ search, onChange, saving }: { search: Search; onChange: (on: boolean) => void; saving: boolean }) {
  const on = Boolean(search.ongoing);
  const id = `ongoing-${search.id}`;
  return (
    <div className="mt-8 flex items-center justify-between gap-6 rounded-[22px] bg-foreground/[0.03] px-5 py-3.5">
      <div className="flex min-w-0 items-start gap-3">
        <Repeat className={cn('mt-0.5 size-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
        <div className="min-w-0">
          <label htmlFor={id} className="text-sm font-medium">
            {on ? 'Keeps finding new leads' : 'Keep finding new leads'}
          </label>
          <p className="mt-0.5 text-xs text-pretty text-muted-foreground">
            {on
              ? 'nvoke keeps looking and adds new companies as it finds them, a few a day. Switch it off to stop.'
              : 'Off. The list stays as it is. Switch it on and nvoke adds new companies as it finds them.'}
          </p>
        </div>
      </div>
      <Switch id={id} checked={on} onCheckedChange={onChange} disabled={saving} aria-label="Keep finding new leads" />
    </div>
  );
}

function Overview({
  search,
  timing,
  onRunAgain,
  starting,
  onSearchMore,
  counts,
  partial,
  onOngoing,
  savingOngoing,
}: {
  search: Search;
  timing: string;
  onRunAgain: () => void;
  starting: boolean;
  /** Null while Search more is open, or when the search cannot run again. */
  onSearchMore: (() => void) | null;
  /** From the companies loaded so far; null until they load or while a text filter narrows them. */
  counts: PeopleCounts | null;
  /** More pages to load, so the counts are a floor. */
  partial: boolean;
  onOngoing: (on: boolean) => void;
  savingOngoing: boolean;
}) {
  const active = isActive(search.status);
  const showLive = active || Boolean(search.ongoing);
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  const n = (v: number): string => (partial ? `${formatNumber(v)}+` : formatNumber(v));
  return (
    <section className={cn(APP_INSET, 'pt-6 pb-10')}>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl" title={search.kind === 'icp' ? search.params.description : undefined}>
        {searchTitle(search)}
      </h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
        <StatusLabel status={search.status} />
        <span>
          {searchSubtitle(search)}, {timing}
        </span>
      </div>
      <RunsLine search={search} />
      {showLive && <LiveLine search={search} counts={counts} partial={partial} />}
      {canBeOngoing(search) && !(search.status === 'failed' && stoppedByQuota(search)) && (
        <OngoingSwitch search={search} onChange={onOngoing} saving={savingOngoing} />
      )}
      <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-4">
        <Stat label="Companies" value={formatNumber(search.companiesFound)} sub={search.ongoing ? undefined : `of ${formatNumber(search.limit)}`} />
        <Stat label="Named people" value={counts ? n(counts.people) : '0'} />
        <Stat label="Decision makers" value={counts ? n(counts.decisionMakers) : '0'} />
        <Stat label="Verified emails" value={formatNumber(search.emailsValid)} sub={validShare === null ? undefined : `${validShare}%`} />
      </div>
      {search.status === 'failed' && (
        <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[20px] bg-destructive/8 px-4 py-3 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">{errorMessage(search.error)} The results found until then are kept below.</span>
          {stoppedByQuota(search) ? (
            <Button asChild size="sm">
              <Link href={BILLING_PATH}>
                Upgrade
                <ArrowUpRight className="size-3.5 opacity-70" />
              </Link>
            </Button>
          ) : search.kind === 'drop' ? null : (
            <Button size="sm" variant="outline" onClick={onRunAgain} disabled={starting}>
              <RotateCw />
              Run again
            </Button>
          )}
        </div>
      )}
      {onSearchMore && foundFew(search) && search.companiesFound > 0 && !stoppedByQuota(search) && (
        <FoundFewNote search={search} onSearchMore={onSearchMore} />
      )}
    </section>
  );
}

/* Rows */

function EmailLine({ email, checking }: { email: Email; checking: boolean }) {
  return (
    <div className="group/email flex min-w-0 items-center gap-2" data-email={email.address}>
      <button
        type="button"
        onClick={() => void copy(email.address, email.address)}
        className="-my-1.5 flex min-w-0 items-center gap-1.5 rounded-sm py-1.5 text-left font-mono text-xs text-foreground/80 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 sm:my-0 sm:py-0 dark:text-foreground/65 dark:hover:text-primary"
        title={`Copy ${email.address}`}
      >
        {/* Phones show the whole address over two lines rather than cutting it. */}
        <span className="wrap-anywhere sm:truncate">
          {email.address.split('@')[0]}@<wbr />
          {email.address.split('@').slice(1).join('@')}
        </span>
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/email:opacity-60" />
      </button>
      <span className="hidden max-w-40 shrink-0 truncate text-2xs text-muted-foreground sm:inline">
        {email.person ? personName(email.person) : email.kind === 'personal' ? 'person' : 'shared inbox'}
      </span>
      <span className="ml-auto" />
      <VerificationBadge value={email.verification ?? 'unknown'} pending={checking && email.verification === null} />
    </div>
  );
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

function EmailsCell({ company, live, onCheckInboxes }: { company: Company; live: boolean; onCheckInboxes: (() => void) | null }) {
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
  if ((company.crawlStatus === 'refused' || company.crawlStatus === 'js_only') && company.localCrawl !== 'done') {
    const why = company.crawlStatus === 'js_only' ? 'Needs JavaScript' : 'Refuses our servers';
    return (
      <span className={quiet}>
        {why}.{' '}
        <Link href="/download" className="text-foreground/80 underline-offset-4 hover:underline">
          nvoke Desktop
        </Link>{' '}
        can read it from your computer
      </span>
    );
  }
  // Read, nothing named, but a shared inbox skipped or still checking: it is there, just not shown.
  const skipped = company.inboxesSkipped ?? 0;
  if (company.emails.length === 0 && skipped + (company.inboxesPending ?? 0) > 0) {
    return <NoPersonLine company={company} onCheckInboxes={skipped > 0 ? onCheckInboxes : null} />;
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

/** The drafted first line under a company, to copy into the user's own outreach. */
function OpenerLine({ opener }: { opener: Opener }) {
  const quiet = 'text-xs leading-5 text-muted-foreground';
  if (opener.status === 'queued') {
    return (
      <span className={cn(quiet, 'inline-flex items-center gap-2')}>
        <Loader2 className="size-3 text-primary motion-safe:animate-spin" />
        Drafting opener
      </span>
    );
  }
  if (opener.status === 'none') return <span className={cn(quiet, 'text-muted-foreground/70')}>No fact on the site to build on</span>;
  if (opener.status === 'failed' || !opener.line) return <span className={cn(quiet, 'text-muted-foreground/70')}>Opener failed, draft it again</span>;
  const line = opener.line;
  return (
    <div className="group/opener flex min-w-0 max-w-[68ch] items-start gap-2">
      <p className="min-w-0 select-text text-[13px] leading-5 text-pretty text-foreground/80 dark:text-foreground/70">
        {line}
        {opener.sourceUrl && (
          <a
            href={opener.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            title={opener.quote ?? undefined}
            className="ml-2 whitespace-nowrap rounded-sm font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            from {openerSourceLabel(opener.sourceUrl)}
          </a>
        )}
      </p>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="-my-0.5 size-6 shrink-0 text-muted-foreground transition-opacity pointer-fine:opacity-0 group-hover/opener:opacity-100 focus-visible:opacity-100"
            aria-label="Copy opener"
            onClick={() => void copy(line, 'the opener')}
          >
            <Copy className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy opener</TooltipContent>
      </Tooltip>
    </div>
  );
}

function CompanyRow({
  company,
  live,
  onDraftOpener,
  onCheckInboxes,
}: {
  company: Company;
  live: boolean;
  onDraftOpener: (company: Company) => void;
  /** Switches on the search's shared inboxes; null when they are on already. */
  onCheckInboxes: (() => void) | null;
}) {
  const source = SOURCE_LABEL[company.source] ?? company.source;
  const opener = company.opener;
  const draftable = canDraftOpener(company) && opener?.status !== 'queued';
  const draftLabel = opener ? 'Draft opener again' : 'Draft opener';
  return (
    <div
      data-company-row
      className={cn(COLUMNS, 'group flex flex-col gap-2 rounded-[20px] px-4 py-4 transition-colors duration-150 hover:bg-foreground/[0.035] md:items-start sm:px-6')}
    >
      <div className="min-w-0 leading-5">
        <div className="truncate text-[14px] font-medium" title={company.name}>
          {company.name}
        </div>
        <a
          href={company.website}
          target="_blank"
          rel="noreferrer"
          title={company.domain}
          className="block max-w-full truncate rounded-sm font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {company.domain}
        </a>
      </div>
      <EmailsCell company={company} live={live} onCheckInboxes={onCheckInboxes} />
      <div className="min-w-0 text-xs leading-5 text-muted-foreground">
        <div className="truncate" title={company.location ?? source}>
          {company.location ?? source}
        </div>
        {company.phone && <div className="truncate tabular-nums">{company.phone}</div>}
      </div>
      <div className="-my-0.5 hidden justify-end gap-0.5 transition-opacity duration-150 pointer-fine:opacity-0 group-hover:opacity-100 focus-within:opacity-100 md:flex">
        {company.emails.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground"
                aria-label="Copy all emails"
                onClick={() => void copy(company.emails.map((e) => e.address).join(', '), `${company.emails.length} emails`)}
              >
                <Copy className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy all emails</TooltipContent>
          </Tooltip>
        )}
        {draftable && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 text-muted-foreground"
                aria-label={draftLabel}
                onClick={() => onDraftOpener(company)}
              >
                <PenLine className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{draftLabel}</TooltipContent>
          </Tooltip>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="size-6 text-muted-foreground">
              <a href={company.website} target="_blank" rel="noreferrer" aria-label="Open website">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open website</TooltipContent>
        </Tooltip>
      </div>
      {opener && (
        <div className="min-w-0 md:col-span-3 md:-mt-3">
          <OpenerLine opener={opener} />
        </div>
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, 'flex flex-col gap-3 px-4 py-5 sm:px-6')}>
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

type View = 'people' | 'companies';

/* Screen */

/** The page before its search loads: the route's loading state, and the screen's own while the first answer comes. */
export function ResultsLoading() {
  return (
    <main className={APP_FRAME}>
      <div className={cn(APP_INSET, 'flex items-center gap-2 pt-8')}>
        <BackLink />
      </div>
      <div className={cn(APP_INSET, 'pt-6 pb-10')}>
        <Skeleton className="h-8 w-80 max-w-full" />
        <Skeleton className="mt-3 h-3.5 w-56" />
      </div>
      <PeopleSkeleton />
    </main>
  );
}

export function ResultsScreen({ id }: { id: string }) {
  const router = useRouter();
  const api = useApi();
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState('');
  const [view, setView] = useState<View>('people');
  const [peopleFilters, setPeopleFilters] = useState<PeopleFilters>({ decisionMakersOnly: false, verifiedOnly: false, showAll: false });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
  const [searchingMore, setSearchingMore] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;

  // The route's metadata can't know the search, and a client navigation keeps the last page's title: name it here.
  const title = search ? searchTitle(search) : null;
  useEffect(() => {
    if (title) document.title = `${title} | nvoke`;
  }, [title]);

  // A search that goes live again closes Search more, wherever the run came from.
  const [wasLive, setWasLive] = useState(live);
  if (live !== wasLive) {
    setWasLive(live);
    if (live) setSearchingMore(false);
  }
  const ongoing = Boolean(search?.ongoing);
  // The filters that narrow by address run on the server, so the list, its total and the pages stay small.
  const listFilters = {
    q: q || undefined,
    verification: peopleFilters.verifiedOnly ? ('valid' as const) : undefined,
    decisionMakers: peopleFilters.decisionMakersOnly || undefined,
  };
  const companies = useCompanies(id, listFilters, live, ongoing);
  useRefreshWhenFinished(live, id);
  const cancel = useCancelSearch();
  const create = useCreateSearch();
  const draft = useDraftOpeners(id);
  const update = useUpdateSearch();
  const left = emailsLeft(useMe().data);
  // When the screen asked for the shared inbox checks it follows, until none is pending or INBOX_FOLLOW_MS passed.
  const [inboxesSince, setInboxesSince] = useState<number | null>(null);
  const inboxesFollowing = inboxesSince !== null && Boolean(search?.checkInboxes) && search?.inboxesPending !== 0;
  useFollowInboxChecks(id, listFilters, inboxesFollowing && !live ? inboxesSince : null);
  const sentinel = useRef<HTMLDivElement>(null);

  const loaded = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = companies;
  const narrowed = peopleFilters.decisionMakersOnly || peopleFilters.verifiedOnly;
  const filtered = Boolean(q) || narrowed;
  const people = view === 'people' ? peopleRows(loaded, peopleFilters) : [];
  const rows = view === 'companies' ? filterCompanies(loaded, peopleFilters) : [];
  const shown = view === 'people' ? people.length : rows.length;

  // The counts come from the companies loaded without filters, so filtering keeps the last ones.
  const [counts, setCounts] = useState<PeopleCounts | null>(null);
  const loadedCounts = companies.data && !q && !narrowed && !companies.isPlaceholderData ? peopleCounts(loaded) : null;
  if (loadedCounts && JSON.stringify(loadedCounts) !== JSON.stringify(counts)) setCounts(loadedCounts);
  const [partial, setPartial] = useState(false);
  if (loadedCounts && Boolean(hasNextPage) !== partial) setPartial(Boolean(hasNextPage));

  const setFilter = (key: keyof PeopleFilters) => (value: boolean) => setPeopleFilters((f) => ({ ...f, [key]: value }));
  const clearFilters = (): void => {
    setText('');
    setPeopleFilters({ decisionMakersOnly: false, verifiedOnly: false, showAll: false });
  };

  // Loads the next page as the end of the list scrolls into view.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, loaded.length, shown]);

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
      // The same server filters as the list.
      const filters = {
        q: q || undefined,
        verification: peopleFilters.verifiedOnly ? ('valid' as const) : undefined,
        decisionMakers: peopleFilters.decisionMakersOnly || undefined,
      };
      const narrowedCsv = Boolean(filters.q || filters.verification || filters.decisionMakers);
      const blob = await api.exportCsv(search.id, filters);
      const name = narrowedCsv ? csvFileName(search).replace(/\.csv$/, '-filtered.csv') : csvFileName(search);
      saveFile(blob, name);
      toast.success(narrowedCsv ? 'Exported the filtered emails' : `Exported ${formatNumber(search.emailsFound)} emails`, { description: name });
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  function setOngoing(on: boolean): void {
    update.mutate(
      { id, patch: { ongoing: on } },
      {
        onSuccess: () =>
          toast(on ? 'Keeps finding new leads' : 'Stopped looking for new leads', {
            description: on ? 'New companies land here as nvoke finds them.' : 'Everything found so far is kept.',
          }),
      },
    );
  }

  /** Switches on the search's shared inboxes, shows them and follows their checks as they settle. */
  function startInboxChecks(): void {
    if (update.isPending) return;
    update.mutate(
      { id, patch: { checkInboxes: true } },
      {
        onSuccess: () => {
          setPeopleFilters((f) => ({ ...f, showAll: true }));
          setInboxesSince(Date.now());
          void companies.refetch();
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

  function doCancel(): void {
    cancel.mutate(id, {
      onSuccess: () => toast('Search stopped', { description: 'Everything found so far is kept.' }),
      onError: (err) => toast.error('Couldn’t stop the search', { description: err.message }),
    });
  }

  /** Starts a fresh search with the same parameters and opens it. */
  function runAgain(): void {
    if (!search || create.isPending) return;
    const input = {
      kind: search.kind,
      params: search.params,
      limit: search.limit,
      ...(search.checkInboxes ? { checkInboxes: true } : {}),
    } as CreateSearchInput;
    create.mutate(input, {
      onSuccess: (next) => {
        toast.success('Search started', { description: searchTitle(next) });
        router.replace(`/app/searches/${next.id}`);
      },
      onError: (err) =>
        isQuotaError(err)
          ? toast.error('This month’s verified emails are used up', {
              action: { label: 'Upgrade', onClick: () => router.push(BILLING_PATH) },
            })
          : toast.error('Couldn’t start the search', { description: err.message }),
    });
  }

  /** Queues openers (the whole search, or the given companies) and says what happened. */
  function draftOpeners(body: DraftOpenersInput): void {
    if (draft.isPending) return;
    draft.mutate(body, {
      onSuccess: (res) => {
        const { title, description } = openersNotice(res);
        if (res.queued === 0) toast(title, { description });
        else toast.success(title, { description });
      },
      onError: (err) =>
        err instanceof ApiError && err.code === 'ai_unavailable'
          ? toast.error('Claude is not answering right now. Try again in a minute.')
          : toast.error('Couldn’t draft openers', { description: err.message }),
    });
  }

  /** One row: a first draft, or a fresh one when it has an opener already. */
  function draftOpener(company: Company): void {
    draftOpeners({ companyIds: [company.id], redo: company.opener !== null });
  }

  const header = (
    <div className={cn(APP_INSET, 'flex items-center gap-2 pt-8')}>
      <BackLink />
      {search && (
        <div className="ml-auto flex items-center gap-2">
          {canSearchMore(search) && !searchingMore && (
            <Button variant="glass" size="sm" className="h-9 px-4" onClick={() => setSearchingMore(true)}>
              <Plus />
              Search more
            </Button>
          )}
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
              {canSearchMore(search) && (
                <DropdownMenuItem onSelect={() => setSearchingMore(true)} disabled={searchingMore}>
                  <Plus />
                  Search more
                </DropdownMenuItem>
              )}
              {search.kind !== 'drop' && (
                <DropdownMenuItem onSelect={runAgain} disabled={live || create.isPending}>
                  <RotateCw />
                  Run again
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={requestExport} disabled={search.emailsFound === 0}>
                <Download />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => draftOpeners({})} disabled={search.emailsValid === 0 || draft.isPending}>
                <PenLine />
                Draft openers
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => draftOpeners({ redo: true })} disabled={search.emailsValid === 0 || draft.isPending}>
                <RefreshCw />
                Draft openers again
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete search
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );

  if (searchQuery.error) {
    const missing = searchQuery.error instanceof ApiError && (searchQuery.error.status === 404 || searchQuery.error.status === 400);
    return (
      <main className={APP_FRAME}>
        {header}
        {missing ? (
          <EmptyState
            icon={SearchX}
            title="This search is gone"
            action={
              <Button asChild variant="outline">
                <Link href="/app">Back to searches</Link>
              </Button>
            }
          >
            It was deleted, or the link is wrong.
          </EmptyState>
        ) : (
          <ErrorState error={searchQuery.error} onRetry={() => void searchQuery.refetch()} />
        )}
      </main>
    );
  }

  if (!search) {
    return (
      <main className={APP_FRAME}>
        {header}
        <div className={cn(APP_INSET, 'pt-6 pb-10')}>
          <Skeleton className="h-8 w-80 max-w-full" />
          <Skeleton className="mt-3 h-3.5 w-56" />
        </div>
        <TableSkeleton />
      </main>
    );
  }

  const timing = search.startedAt
    ? `${relativeTime(search.createdAt)}, ${live ? 'running for' : 'took'} ${duration(search.startedAt, search.finishedAt)}`
    : relativeTime(search.createdAt);

  const inboxesOff = !search.checkInboxes;
  const more = hasNextPage ? '+' : '';
  const dockCount =
    view === 'people'
      ? `${formatNumber(shown)}${more} ${shown === 1 && !more ? 'person' : 'people'}`
      : filtered
        ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)}`
        : `${formatNumber(total)} companies`;

  return (
    <main className={cn(APP_FRAME, 'pb-40')}>
      {header}
      <Overview
        search={search}
        timing={timing}
        onRunAgain={runAgain}
        starting={create.isPending}
        onSearchMore={canSearchMore(search) && !searchingMore ? () => setSearchingMore(true) : null}
        counts={counts}
        partial={partial}
        onOngoing={setOngoing}
        savingOngoing={update.isPending}
      />
      {searchingMore && canSearchMore(search) && <SearchMorePanel search={search} onClose={() => setSearchingMore(false)} />}

      <div className={cn(APP_INSET, 'flex flex-wrap items-center justify-between gap-3 pb-3')}>
        <Segmented<View>
          label="Show"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: 'people', label: 'People' },
            { value: 'companies', label: 'Companies' },
          ]}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <Info className="size-3.5" />
              About these leads
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-80 rounded-2xl px-3 py-2 leading-relaxed">
            People and addresses from each company’s own website, or built from the domain’s address pattern and accepted by
            its mail server. Shared inboxes (info@, hello@) are skipped unless you ask for them. Many EU countries require prior
            consent for marketing email, even to businesses. Results are deleted 12 months after the search.
          </TooltipContent>
        </Tooltip>
      </div>

      {view === 'people' ? (
        <div className={cn(PEOPLE_COLUMNS, 'hidden px-6 py-2 text-xs text-muted-foreground')}>
          <span>Person</span>
          <span>Email</span>
          <span>Company</span>
          <span />
        </div>
      ) : (
        <div className={cn(COLUMNS, 'hidden px-6 py-2 text-xs text-muted-foreground')}>
          <span>Company</span>
          <span>Emails</span>
          <span>{search.kind === 'local' ? 'Location' : 'Found on'}</span>
          <span />
        </div>
      )}

      <div>
        {companies.isPending ? (
          view === 'people' ? (
            <PeopleSkeleton />
          ) : (
            <TableSkeleton />
          )
        ) : companies.error ? (
          <ErrorState error={companies.error} onRetry={() => void companies.refetch()} />
        ) : shown === 0 && !hasNextPage ? (
          filtered ? (
            <EmptyState
              icon={SearchX}
              title={loaded.length > 0 && !q ? 'Nobody matches these filters yet' : 'Nothing matches these filters'}
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              {live || ongoing ? 'More people arrive as the search goes on.' : undefined}
            </EmptyState>
          ) : live || (ongoing && loaded.length === 0) ? (
            <EmptyState icon={Radar} title={search.kind === 'icp' ? 'Planning and looking' : 'Looking for companies'}>
              People show up here the moment we find them.
            </EmptyState>
          ) : (
            <EmptyState
              icon={Inbox}
              title="No companies found"
              action={
                canSearchMore(search) && !searchingMore && !stoppedByQuota(search) ? (
                  <Button onClick={() => setSearchingMore(true)}>
                    <Plus />
                    Search more
                  </Button>
                ) : undefined
              }
            >
              {search.kind === 'icp'
                ? 'Describe your customer in other words, wider or in another country, and start again.'
                : search.status === 'failed'
                  ? 'It stopped before finding any. Search again into this list, wider or with other words.'
                  : 'Widen it: another place, keyword or window adds to this list.'}
            </EmptyState>
          )
        ) : (
          <div className="flex flex-col">
            {view === 'people'
              ? people.map((row) => (
                  <PersonRowView
                    key={row.key}
                    row={row}
                    live={live || inboxesFollowing}
                    onOpenCompany={(domain) => {
                      setView('companies');
                      setText(domain);
                    }}
                  />
                ))
              : rows.map((company) => (
                  <CompanyRow
                    key={company.id}
                    company={company}
                    live={live || inboxesFollowing}
                    onDraftOpener={draftOpener}
                    onCheckInboxes={inboxesOff ? startInboxChecks : null}
                  />
                ))}
            <div ref={sentinel} className="flex h-10 items-center justify-center">
              {isFetchingNextPage && <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" />}
            </div>
          </div>
        )}
      </div>

      {/* The dock: filters and export float over the list, in glass. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center gap-2 px-3 sm:bottom-6">
        {view === 'people' && peopleFilters.showAll && inboxesOff && (
          <div
            data-inbox-notice
            className="glass pointer-events-auto flex w-full max-w-[640px] flex-col gap-3 rounded-[24px] py-3 pr-3 pl-5 motion-safe:animate-rise sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 leading-5">
              <div className="text-sm font-medium">{SHARED_INBOXES.title}</div>
              <div className="text-xs text-muted-foreground">{SHARED_INBOXES.body}</div>
              <div data-inbox-cost className="mt-1 text-xs text-foreground/80">
                {inboxCost(search.inboxesSkipped, left)}
              </div>
            </div>
            <Button size="sm" className="shrink-0 self-start sm:self-auto" onClick={startInboxChecks} disabled={update.isPending}>
              {update.isPending ? <Loader2 className="motion-safe:animate-spin" /> : <Inbox />}
              {SHARED_INBOXES.action}
            </Button>
          </div>
        )}
        {inboxesFollowing && (
          <div
            data-inbox-checking
            role="status"
            aria-live="polite"
            className="glass pointer-events-auto flex min-h-9 items-center gap-2 rounded-full px-4 py-2 text-xs text-muted-foreground motion-safe:animate-rise"
          >
            <Loader2 className="size-3.5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden />
            {inboxChecking(search.inboxesPending)}
          </div>
        )}
        <div className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[24px] p-1.5 motion-safe:animate-rise lg:flex-nowrap lg:rounded-full">
          <div className="relative w-full lg:w-60">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setText('');
                  e.currentTarget.blur();
                }
              }}
              placeholder="Filter people and companies"
              aria-label="Filter people and companies"
              autoComplete="off"
              spellCheck={false}
              className="h-9 w-full rounded-full bg-foreground/[0.045] pr-9 pl-9 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
            {text && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setText('')}
                className="absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/40 text-background outline-none hover:bg-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
            )}
          </div>
          <Pill
            pressed={peopleFilters.decisionMakersOnly}
            onClick={() => setFilter('decisionMakersOnly')(!peopleFilters.decisionMakersOnly)}
            className="h-8"
          >
            Decision makers
          </Pill>
          <Pill pressed={peopleFilters.verifiedOnly} onClick={() => setFilter('verifiedOnly')(!peopleFilters.verifiedOnly)} className="h-8">
            Verified only
          </Pill>
          {view === 'people' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Pill pressed={peopleFilters.showAll} onClick={() => setFilter('showAll')(!peopleFilters.showAll)} className="h-8">
                  {SHARED_INBOXES.pill}
                </Pill>
              </TooltipTrigger>
              <TooltipContent>
                {inboxesOff ? SHARED_INBOXES.title : peopleFilters.showAll ? SHARED_INBOXES.hintOn : SHARED_INBOXES.hintOff}
              </TooltipContent>
            </Tooltip>
          )}
          <span className="hidden min-w-20 items-center justify-end gap-1.5 px-3 text-xs tabular-nums text-muted-foreground lg:flex">
            {companies.isPlaceholderData && <Loader2 className="size-3 motion-safe:animate-spin" />}
            {companies.data && dockCount}
          </span>
          <Button onClick={requestExport} disabled={exporting || search.emailsFound === 0}>
            {exporting ? <Loader2 className="motion-safe:animate-spin" /> : <Download />}
            Export CSV
          </Button>
        </div>
      </div>

      <ExportNoticeDialog open={exportNotice} onOpenChange={setExportNotice} onExport={() => void doExport()} />

      <DeleteSearchDialog search={search} open={confirmDelete} onOpenChange={setConfirmDelete} onDeleted={() => router.replace('/app')} />
    </main>
  );
}
