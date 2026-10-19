'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Ban,
  Check,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  Info,
  ListPlus,
  Loader2,
  MoreHorizontal,
  PenLine,
  Play,
  RefreshCw,
  RotateCw,
  Search as SearchIcon,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Company, CreateSearchInput, DraftOpenersInput, Email, Opener, Search } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { ExportNoticeDialog } from '@/components/app/export-notice-dialog';
import { VerificationBadge } from '@/components/app/indicators';
import { useArrivals } from '@/components/app/motion';
import { FLASH_ROW, useFlash, useFresh } from '@/components/app/results/fresh';
import { SearchDisplay, SearchDisplaySkeleton } from '@/components/app/results/search-display';
import { copy, PEOPLE_COLUMNS, PeopleSkeleton, PersonRowView } from '@/components/app/people-list';
import { FoundFewNote, RunsLine, SearchMorePanel } from '@/components/app/search-more';
import { APP_FRAME, APP_INSET, BackLink, PageHeader } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
import { LogoMark } from '@/components/site/logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, isQuotaError } from '@/lib/app/api';
import {
  csvFileName,
  errorMessage,
  formatNumber,
  emailsLeft,
  inboxChecking,
  inboxCost,
  INBOX_FOLLOW_MS,
  isActive,
  searchRuns,
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
  useSearchMore,
  useUpdateSearch,
} from '@/lib/app/queries';
import { canSearchMore, foundFew } from '@/lib/app/search-form';
import { cn } from '@/lib/utils';

const COLUMNS = 'md:grid md:grid-cols-[minmax(10rem,0.9fr)_minmax(17rem,2fr)_minmax(7rem,0.55fr)_3.5rem] md:gap-6';

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

/** Keep finding new leads, on a plain words search. */
function OngoingSwitch({ search, onChange, saving }: { search: Search; onChange: (on: boolean) => void; saving: boolean }) {
  const on = Boolean(search.ongoing);
  const line = on
    ? isActive(search.status)
      ? 'Keeps looking when this run ends.'
      : 'Looks a few times a day and adds new people here.'
    : 'Off. The list stays as it is.';
  return (
    <label data-ongoing className="flex min-w-0 cursor-pointer flex-wrap items-center gap-x-3.5 gap-y-1">
      <Switch checked={on} onCheckedChange={onChange} disabled={saving} aria-label="Keep finding new leads" />
      <span className="shrink-0 text-sm font-medium">Keeps finding new leads</span>
      <span className="min-w-0 text-sm text-pretty text-muted-foreground sm:truncate" title={line}>
        {line}
      </span>
    </label>
  );
}

/**
 * The run that picks a stopped search up where it left off: the latest run's
 * words again, for the companies its limit still had room for. Null when the
 * search was not stopped, is a pasted list or had reached its limit.
 */
function continueInput(search: Search): CreateSearchInput | null {
  if (search.status !== 'canceled' || !canSearchMore(search) || search.kind === 'domains') return null;
  const last = searchRuns(search).at(-1);
  if (!last) return null;
  const left = last.limit - (search.companiesFound - last.foundBefore);
  if (left < 1) return null;
  return { kind: search.kind, params: last.params, limit: left } as CreateSearchInput;
}

function Overview({
  search,
  onRunAgain,
  starting,
  onContinue,
  continuing,
  editing,
  onSearchMore,
  onCloseMore,
  counts,
  partial,
  onOngoing,
  savingOngoing,
}: {
  search: Search;
  onRunAgain: () => void;
  starting: boolean;
  onContinue: () => void;
  continuing: boolean;
  /** Search more is open under the display, in place of its keys. */
  editing: boolean;
  onSearchMore: () => void;
  onCloseMore: () => void;
  /** From the companies loaded so far; null until they load or while a text filter narrows them. */
  counts: PeopleCounts | null;
  /** More pages to load, so the counts are a floor. */
  partial: boolean;
  onOngoing: (on: boolean) => void;
  savingOngoing: boolean;
}) {
  const active = isActive(search.status);
  const more = canSearchMore(search) && !stoppedByQuota(search);
  const few = more && foundFew(search) && search.companiesFound > 0;
  const resume = continueInput(search) && (
    <Button variant="dark" onClick={onContinue} disabled={continuing}>
      <Play />
      Continue
    </Button>
  );
  const ongoingSwitch = canBeOngoing(search) && !(search.status === 'failed' && stoppedByQuota(search));
  return (
    <section className={cn(APP_INSET, 'flex flex-col gap-6 pt-6 pb-10')}>
      <SearchDisplay search={search} />
      {(counts || searchRuns(search).length > 1) && (
        <div className="-mt-1 flex flex-col gap-2">
          {counts && (
            <p data-counts className="cap tabular-nums text-foreground/75">
              {countsLine(counts, partial)}
              {(active || search.ongoing) && ' so far'}
            </p>
          )}
          <RunsLine search={search} />
        </div>
      )}
      {editing && canSearchMore(search) ? (
        <SearchMorePanel search={search} onClose={onCloseMore} />
      ) : (
        <>
          {ongoingSwitch && <OngoingSwitch search={search} onChange={onOngoing} saving={savingOngoing} />}
          {search.status === 'failed' ? (
            <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-destructive/30 py-3 text-sm">
              <span aria-hidden className="led bg-destructive shadow-[0_0_6px_var(--destructive)]" />
              <span className="min-w-0 flex-1">{errorMessage(search.error)} What it found is kept.</span>
              {stoppedByQuota(search) ? (
                <Button asChild size="sm" variant="dark">
                  <Link href={BILLING_PATH}>
                    Upgrade
                    <ArrowUpRight className="size-3.5 opacity-70" />
                  </Link>
                </Button>
              ) : search.kind === 'drop' ? null : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={onRunAgain} disabled={starting}>
                    <RotateCw />
                    Run again
                  </Button>
                  {more && (
                    <Button size="sm" variant="secondary" onClick={onSearchMore}>
                      <ListPlus />
                      Search more
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : few ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              {resume}
              <FoundFewNote search={search} onSearchMore={onSearchMore} />
            </div>
          ) : (
            more &&
            !active && (
              <div className="flex flex-wrap items-center gap-3">
                {resume}
                <Button variant="secondary" onClick={onSearchMore}>
                  <ListPlus />
                  Search more
                </Button>
              </div>
            )
          )}
        </>
      )}
    </section>
  );
}

/** The steps a search walks through before its first leads, worded per kind. */
function workingSteps(search: Search): string[] {
  const first: Record<Search['kind'], string> = {
    icp: 'Planning where your customers are',
    domains: 'Reading your list',
    local: 'Searching the map',
    web: 'Searching the web',
    launches: 'Reading new launches',
    drop: 'Reading new launches',
  };
  return [first[search.kind], 'Finding companies', 'Reading their websites', 'Finding people and checking emails'];
}

/** The step the search is on, from what it reports and what it has found. */
function workingStep(search: Search): number {
  if (search.emailsFound > 0 || search.companiesCrawled > 0) return 3;
  if (search.companiesFound > 0) return 2;
  if (search.status === 'queued' || search.stage === 'plan') return 0;
  if (search.kind === 'icp' && !search.stage) return 0;
  return 1;
}

/**
 * The wait between starting a search and its first leads, in place of the
 * empty list: rings pulse out from the mark and each step has its LED. The
 * display above says what the pipeline is doing in its own words.
 */
function SearchWorking({ search }: { search: Search }) {
  const at = workingStep(search);
  return (
    <div className="flex flex-col items-center justify-center gap-10 border-t border-border px-2 pt-12 pb-20 motion-safe:animate-rise sm:flex-row sm:gap-14">
      <div aria-hidden className="relative size-36 shrink-0 sm:size-44">
        {[0, 1, 2].map((ring) => (
          <span
            key={ring}
            className="absolute inset-[18%] rounded-full border border-primary/40 opacity-0 motion-safe:animate-ping"
            style={{ animationDuration: '3.3s', animationDelay: `${ring * 1.1}s` }}
          />
        ))}
        <span className="absolute inset-[22%] rounded-full border border-foreground/[0.08]" />
        <span className="absolute inset-0 rounded-full border border-foreground/[0.05]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <LogoMark motion="loading" className="size-12" />
        </div>
      </div>
      <div className="min-w-0 max-w-md">
        <h2 className="font-display text-2xl font-light tracking-[-0.02em]">
          {search.kind === 'icp' ? 'Looking for your customers' : 'Looking for companies'}
        </h2>
        <ol aria-label="Steps" className="mt-6 flex flex-col gap-2.5 text-sm">
          {workingSteps(search).map((label, i) => (
            <li
              key={label}
              aria-current={i === at ? 'step' : undefined}
              className={cn(
                'flex items-center gap-3 transition-colors duration-500',
                i < at && 'text-muted-foreground',
                i === at && 'font-medium text-foreground',
                i > at && 'text-muted-foreground/60',
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                {i < at ? (
                  <Check className="size-4 text-primary motion-safe:animate-pop-in" strokeWidth={2.25} />
                ) : (
                  <span className={cn('led', i === at && 'led-on motion-safe:animate-blink')} />
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className="cap mt-6 text-muted-foreground">First leads in a minute or two. Closing the tab is fine.</p>
      </div>
    </div>
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
  style,
  fresh = false,
}: {
  company: Company;
  live: boolean;
  /** Found by a poll while the search runs: the row lights up as it lands. */
  fresh?: boolean;
  /** Carries the row's stagger index (`--i`). */
  style?: CSSProperties;
  onDraftOpener: (company: Company) => void;
  /** Switches on the search's shared inboxes; null when they are on already. */
  onCheckInboxes: (() => void) | null;
}) {
  const source = SOURCE_LABEL[company.source] ?? company.source;
  const opener = company.opener;
  const draftable = canDraftOpener(company) && opener?.status !== 'queued';
  const draftLabel = opener ? 'Draft opener again' : 'Draft opener';
  const lit = useFlash(fresh);
  return (
    <div
      data-company-row
      data-fresh={lit || undefined}
      style={style}
      // A hairline row on the page.
      className={cn(
        COLUMNS,
        'group flex flex-col gap-2 border-t border-border py-4 transition-[background-color,box-shadow] duration-[1200ms] last:border-b hover:bg-foreground/[0.035] hover:duration-150 md:items-start sm:px-3',
        lit && FLASH_ROW,
      )}
    >
      <div className="min-w-0 leading-5">
        <div className="truncate text-[15px]" title={company.name}>
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
        {company.fit != null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span data-fit className="cap mt-1.5 inline-flex cursor-default items-center gap-1.5 text-muted-foreground">
                <span className="h-[3px] w-10 overflow-hidden rounded-[1px] bg-foreground/10">
                  <span className="block h-full bg-foreground/45" style={{ width: `${company.fit}%` }} />
                </span>
                Fit {company.fit}
              </span>
            </TooltipTrigger>
            <TooltipContent>How well the company matches your description, 0 to 100, judged from its own words.</TooltipContent>
          </Tooltip>
        )}
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
        <div key={i} className={cn(COLUMNS, 'flex flex-col gap-3 border-t border-border py-5 sm:px-3')}>
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

type View = 'people' | 'companies';

/* Screen */

/** The page before its search loads: the route's loading state, and the screen's own while the first answer comes. */
export function ResultsLoading() {
  return (
    <main className={cn(APP_FRAME, 'app-view')}>
      <PageHeader leading={<BackLink />} />
      <div className={cn(APP_INSET, 'pt-6 pb-10')}>
        <SearchDisplaySkeleton />
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
  const filterRef = useRef<HTMLInputElement>(null);
  const searchMore = useSearchMore(id);
  const modKey = useModKey();

  // Mod F puts the cursor in the filter, as on the desktop; pressed again there, the browser's own find opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'f') return;
      const field = filterRef.current;
      if (!field || document.activeElement === field) return;
      e.preventDefault();
      field.focus();
      field.select();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const loaded = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = companies;
  const narrowed = peopleFilters.decisionMakersOnly || peopleFilters.verifiedOnly;
  const filtered = Boolean(q) || narrowed;
  const people = view === 'people' ? peopleRows(loaded, peopleFilters) : [];
  const rows = view === 'companies' ? filterCompanies(loaded, peopleFilters) : [];
  const shown = view === 'people' ? people.length : rows.length;
  // Rows found by a poll, a filter or the next page come in; the rows on screen stay still.
  const rowKeys = view === 'people' ? people.map((r) => `p:${r.key}`) : rows.map((c) => `c:${c.id}`);
  const arrive = useArrivals(rowKeys);
  // Rows a poll brings in while the search runs light up as they land.
  const fresh = useFresh(rowKeys, live || inboxesFollowing || ongoing);

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

  /** Picks a stopped search up where it left off: the rest of its limit joins this list. */
  function continueSearch(): void {
    if (!search || searchMore.isPending) return;
    const input = continueInput(search);
    if (!input) return;
    searchMore.mutate(input, {
      onSuccess: () => toast.success('Continuing', { description: `${formatNumber(input.limit ?? 0)} more into this list` }),
      onError: (err) =>
        isQuotaError(err)
          ? toast.error('This month’s verified emails are used up', {
              action: { label: 'Upgrade', onClick: () => router.push(BILLING_PATH) },
            })
          : toast.error('Couldn’t continue', { description: err.message }),
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
    <PageHeader
      leading={<BackLink />}
      actions={
        search && (
          <>
            {live && (
              <Button variant="secondary" onClick={doCancel} disabled={cancel.isPending}>
                <Ban className="text-destructive" />
                Stop
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canSearchMore(search) && (
                <DropdownMenuItem onSelect={() => setSearchingMore(true)} disabled={searchingMore}>
                  <ListPlus />
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
          </>
        )
      }
    />
  );

  if (searchQuery.error) {
    const missing = searchQuery.error instanceof ApiError && (searchQuery.error.status === 404 || searchQuery.error.status === 400);
    return (
      <main className={cn(APP_FRAME, 'app-view')}>
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
      <main className={cn(APP_FRAME, 'app-view')}>
        {header}
        <div className={cn(APP_INSET, 'pt-6 pb-10')}>
          <SearchDisplaySkeleton />
        </div>
        <PeopleSkeleton />
      </main>
    );
  }

  const inboxesOff = !search.checkInboxes;
  const more = hasNextPage ? '+' : '';
  const dockCount =
    view === 'people'
      ? `${formatNumber(shown)}${more} ${shown === 1 && !more ? 'person' : 'people'}`
      : filtered
        ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)}`
        : `${formatNumber(total)} companies`;

  return (
    <main className={cn(APP_FRAME, 'app-view pb-48')}>
      {header}
      <Overview
        search={search}
        onRunAgain={runAgain}
        starting={create.isPending}
        onContinue={continueSearch}
        continuing={searchMore.isPending}
        editing={searchingMore}
        onSearchMore={() => setSearchingMore(true)}
        onCloseMore={() => setSearchingMore(false)}
        counts={counts}
        partial={partial}
        onOngoing={setOngoing}
        savingOngoing={update.isPending}
      />

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
      </div>

      {view === 'people' ? (
        <div key="people" className={cn(PEOPLE_COLUMNS, 'cap tab-in hidden py-2 text-muted-foreground sm:px-3')}>
          <span className="flex items-center gap-1.5">
            Person
            <AboutLeads />
          </span>
          <span>Email</span>
          <span>Company</span>
          <span />
        </div>
      ) : (
        <div key="companies" className={cn(COLUMNS, 'cap tab-in hidden py-2 text-muted-foreground sm:px-3')}>
          <span>Company</span>
          <span className="flex items-center gap-1.5">
            People
            <AboutLeads />
          </span>
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
            <SearchWorking search={search} />
          ) : searchingMore ? null : (
            <EmptyState
              icon={Inbox}
              title="No companies found"
              action={
                canSearchMore(search) && !stoppedByQuota(search) ? (
                  <Button variant="outline" onClick={() => setSearchingMore(true)}>
                    <ListPlus />
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
          <div key={view} className="stagger flex flex-col">
            {view === 'people'
              ? people.map((row) => (
                  <PersonRowView
                    key={row.key}
                    style={arrive(`p:${row.key}`)}
                    fresh={fresh.has(`p:${row.key}`)}
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
                    style={arrive(`c:${company.id}`)}
                    fresh={fresh.has(`c:${company.id}`)}
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

      {/* The key bar: filters and export floating over the list, with its notices above it. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-3 z-30 flex flex-col items-center gap-2 px-3 sm:bottom-6">
        {view === 'people' && peopleFilters.showAll && inboxesOff && (
          <div
            data-inbox-notice
            className="pointer-events-auto flex w-full max-w-[640px] flex-col gap-3 rounded-[6px] bg-background py-3 pr-3 pl-5 shadow-[0_0_0_1px_var(--border),0_12px_24px_-12px_var(--shadow-color)] motion-safe:animate-rise sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 leading-5">
              <div className="text-sm font-medium">{SHARED_INBOXES.title}</div>
              <div className="text-xs text-muted-foreground">{SHARED_INBOXES.body}</div>
              <div data-inbox-cost className="mt-1 text-xs text-foreground/80">
                {inboxCost(search.inboxesSkipped, left)}
              </div>
            </div>
            <Button size="sm" variant="dark" className="shrink-0 self-start sm:self-auto" onClick={startInboxChecks} disabled={update.isPending}>
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
            className="pointer-events-auto flex min-h-9 items-center gap-2 rounded-[6px] bg-background px-4 py-2 text-xs text-muted-foreground shadow-[0_0_0_1px_var(--border)] motion-safe:animate-rise"
          >
            <Loader2 className="size-3.5 shrink-0 text-primary motion-safe:animate-spin" aria-hidden />
            {inboxChecking(search.inboxesPending)}
          </div>
        )}
        {/* Flat, in the page colour with a hairline. */}
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-2.5 rounded-[6px] bg-background px-3 pt-3.5 pb-3 shadow-[0_-16px_20px_-8px_var(--background),0_0_0_1px_var(--border)] motion-safe:animate-rise motion-safe:[animation-delay:120ms] lg:flex-nowrap">
          <div className="relative w-full lg:w-60">
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
              placeholder={view === 'people' ? 'Filter people' : 'Filter companies'}
              aria-label="Filter people and companies"
              autoComplete="off"
              spellCheck={false}
              className="h-8 w-full rounded-[4px] bg-card pr-14 pl-9 font-mono text-xs shadow-[inset_0_1px_2px_var(--shadow-strong)] outline-none transition-[background-color,box-shadow] duration-150 placeholder:tracking-[0.08em] placeholder:text-muted-foreground/90 placeholder:uppercase focus-visible:ring-2 focus-visible:ring-ring/50"
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
              modKey && <Kbd className="absolute top-1/2 right-2.5 hidden -translate-y-1/2 bg-transparent pointer-fine:inline-flex">{modKey} F</Kbd>
            )}
          </div>
          <div className="flex max-w-full items-center gap-2.5 overflow-x-auto pt-0.5 pb-1 [scrollbar-width:none] lg:overflow-visible lg:p-0">
            <FilterKey on={peopleFilters.decisionMakersOnly} onChange={setFilter('decisionMakersOnly')}>
              Decision makers
            </FilterKey>
            <FilterKey on={peopleFilters.verifiedOnly} onChange={setFilter('verifiedOnly')}>
              Verified
            </FilterKey>
            {view === 'people' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="flex">
                    <FilterKey on={peopleFilters.showAll} onChange={setFilter('showAll')}>
                      {SHARED_INBOXES.pill}
                    </FilterKey>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-60 px-3 py-2 leading-relaxed">
                  {inboxesOff ? SHARED_INBOXES.title : peopleFilters.showAll ? SHARED_INBOXES.hintOn : SHARED_INBOXES.hintOff}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
          <span className="cap hidden min-w-24 items-center justify-end gap-1.5 px-2 tabular-nums text-muted-foreground lg:flex">
            {companies.isPlaceholderData && <Loader2 className="size-3 motion-safe:animate-spin" />}
            {companies.data && (
              <span key={view} className="motion-safe:animate-fade-in">
                {dockCount}
              </span>
            )}
          </span>
          <Button variant="dark" onClick={requestExport} disabled={exporting || search.emailsFound === 0}>
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

/** Where the people and addresses come from, behind the info glyph in the column header. */
function AboutLeads() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="About these leads"
          className="rounded-full text-muted-foreground/70 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Info className="size-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 px-3 py-2 leading-relaxed normal-case tracking-normal">
        Decision makers first. People and addresses come from each company’s own website, or are built from the domain’s
        address pattern and accepted by its mail server. Shared inboxes (info@, hello@) are skipped unless you ask for them.
        Many EU countries require prior consent for marketing email, even to businesses. Results are deleted 12 months after
        the search.
      </TooltipContent>
    </Tooltip>
  );
}

/** A filter that is on or off: a keycap in the key bar whose LED lights when on. */
function FilterKey({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className="key inline-flex h-8 shrink-0 items-center gap-2 bg-secondary px-3.5 font-mono text-[11px] font-medium tracking-[0.08em] whitespace-nowrap text-secondary-foreground uppercase outline-none hover:brightness-[0.97] focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <span aria-hidden className={cn('led transition-[background-color,box-shadow] duration-200', on && 'led-on')} />
      {children}
    </button>
  );
}

/** The modifier key's label on this machine, once known in the browser (so the server render stays plain). */
function useModKey(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl'),
    () => null,
  );
}

function noSubscribe(): () => void {
  return () => {};
}
