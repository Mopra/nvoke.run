'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  Ban,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  Info,
  Loader2,
  MoreHorizontal,
  PenLine,
  Radar,
  RefreshCw,
  RotateCw,
  Search as SearchIcon,
  SearchX,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Company, CreateSearchInput, DraftOpenersInput, Email, EmailKind, Opener, Search, Verification } from '@nvoke/shared';
import { DeleteSearchDialog } from '@/components/app/delete-search-dialog';
import { ExportNoticeDialog } from '@/components/app/export-notice-dialog';
import { StatusLabel, VERIFICATION_DOT, VerificationBadge } from '@/components/app/indicators';
import { progressCaption, SearchProgress } from '@/components/app/search-progress';
import { APP_FRAME, APP_INSET, BackLink } from '@/components/app/shell';
import { EmptyState, ErrorState } from '@/components/app/states';
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
import { Segmented } from '@/components/ui/segmented';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ApiError, isQuotaError } from '@/lib/app/api';
import {
  csvFileName,
  duration,
  errorMessage,
  formatNumber,
  isActive,
  relativeTime,
  searchSubtitle,
  searchTitle,
  shouldShowExportNotice,
  VERIFICATION_LABEL,
} from '@/lib/app/desktop';
import { canDraftOpener, openerSourceLabel, openersNotice } from '@/lib/app/openers';
import { BILLING_PATH, stoppedByQuota } from '@/lib/app/quota';
import {
  useApi,
  useCancelSearch,
  useCompanies,
  useCreateSearch,
  useDraftOpeners,
  useRefreshWhenFinished,
  useSearch,
} from '@/lib/app/queries';
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

const VERIFICATION_ORDER: Verification[] = ['valid', 'catch_all', 'risky', 'unknown', 'invalid'];

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Couldn’t copy to the clipboard');
  }
}

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

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-extralight tabular-nums sm:text-4xl">{formatNumber(value)}</span>
        {sub && <span className="truncate text-sm tabular-nums text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function Overview({ search, timing, onRunAgain, starting }: { search: Search; timing: string; onRunAgain: () => void; starting: boolean }) {
  const active = isActive(search.status);
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  return (
    <section className={cn(APP_INSET, 'pt-6 pb-10')}>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.03em] text-balance sm:text-3xl">{searchTitle(search)}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-muted-foreground">
        <StatusLabel status={search.status} />
        <span>
          {searchSubtitle(search)}, {timing}
        </span>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-8 sm:grid-cols-4">
        <Stat label="Companies" value={search.companiesFound} sub={`of ${formatNumber(search.limit)}`} />
        <Stat label="Websites crawled" value={search.companiesCrawled} />
        <Stat label="Emails found" value={search.emailsFound} />
        <Stat label="Valid emails" value={search.emailsValid} sub={validShare === null ? undefined : `${validShare}%`} />
      </div>
      {active && (
        <div className="mt-8">
          <div className="flex items-center gap-5">
            <SearchProgress search={search} className="h-[3px] flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Every address is checked with its own mail server, a few a minute, so this takes a while. You can close the
            tab: the search keeps running and is here when you come back.
          </p>
        </div>
      )}
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
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left font-mono text-xs text-foreground/80 outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50 dark:text-foreground/65 dark:hover:text-primary"
        title="Copy email"
      >
        <span className="truncate">{email.address}</span>
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/email:opacity-60" />
      </button>
      <span className="shrink-0 text-2xs text-muted-foreground">{email.kind === 'personal' ? 'person' : 'generic'}</span>
      <span className="ml-auto" />
      <VerificationBadge value={email.verification ?? 'unknown'} pending={checking && email.verification === null} />
    </div>
  );
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
            className="-my-0.5 size-6 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/opener:opacity-100 focus-visible:opacity-100"
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
}: {
  company: Company;
  live: boolean;
  onDraftOpener: (company: Company) => void;
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
        <div className="truncate text-[14px] font-medium">{company.name}</div>
        <a
          href={company.website}
          target="_blank"
          rel="noreferrer"
          className="block max-w-full truncate rounded-sm font-mono text-2xs text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {company.domain}
        </a>
      </div>
      <EmailsCell company={company} live={live} />
      <div className="min-w-0 text-xs leading-5 text-muted-foreground">
        <div className="truncate">{company.location ?? source}</div>
        {company.phone && <div className="truncate tabular-nums">{company.phone}</div>}
      </div>
      <div className="-my-0.5 hidden justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 md:flex">
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

/* Toolbar */

function VerificationFilter({ value, onChange }: { value: Verification | undefined; onChange: (value: Verification | undefined) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
            value ? 'bg-primary/10 text-foreground dark:bg-primary/20' : 'text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground',
          )}
        >
          {value && <span className={cn('size-1.5 rounded-full', VERIFICATION_DOT[value])} />}
          {value ? VERIFICATION_LABEL[value] : 'Any verification'}
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Show emails that are</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value ?? 'any'} onValueChange={(v) => onChange(v === 'any' ? undefined : (v as Verification))}>
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

export function ResultsScreen({ id }: { id: string }) {
  const router = useRouter();
  const api = useApi();
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState('');
  const [verification, setVerification] = useState<Verification | undefined>();
  const [kind, setKind] = useState<EmailKind | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;
  const companies = useCompanies(id, { q: q || undefined, verification, kind }, live);
  useRefreshWhenFinished(live, id);
  const cancel = useCancelSearch();
  const create = useCreateSearch();
  const draft = useDraftOpeners(id);
  const sentinel = useRef<HTMLDivElement>(null);

  const rows = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(q || verification || kind);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = companies;

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
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, rows.length]);

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
      const filters = { q: q || undefined, verification, kind };
      const blob = await api.exportCsv(search.id, filters);
      const name = filtered ? csvFileName(search).replace(/\.csv$/, '-filtered.csv') : csvFileName(search);
      saveFile(blob, name);
      toast.success(filtered ? 'Exported the filtered emails' : `Exported ${formatNumber(search.emailsFound)} emails`, { description: name });
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  function doCancel(): void {
    cancel.mutate(id, {
      onSuccess: () => toast('Search stopped', { description: 'Everything found so far is kept.' }),
      onError: (err) => toast.error('Couldn’t stop the search', { description: err.message }),
    });
  }

  /** Starts a fresh search with the same parameters and opens it. */
  function runAgain(): void {
    if (!search || create.isPending) return;
    const input = { kind: search.kind, params: search.params, limit: search.limit } as CreateSearchInput;
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

  return (
    <main className={cn(APP_FRAME, 'pb-40')}>
      {header}
      <Overview search={search} timing={timing} onRunAgain={runAgain} starting={create.isPending} />

      <div className={cn(COLUMNS, 'hidden px-6 py-2 text-xs text-muted-foreground')}>
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
              Public addresses from each company's own website. Generic ones (info@, sales@) and personal ones are marked.
              Many EU countries require prior consent for marketing email, even to businesses. Results are deleted 12
              months after the search.
            </TooltipContent>
          </Tooltip>
        </span>
        <span>{search.kind === 'local' ? 'Location' : 'Found on'}</span>
        <span />
      </div>

      <div>
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
          ) : search.status === 'failed' ? (
            <EmptyState icon={Inbox} title="No companies found">
              It stopped before finding any.
            </EmptyState>
          ) : (
            <EmptyState icon={Inbox} title="No companies found">
              Try a broader keyword or a bigger area.
            </EmptyState>
          )
        ) : (
          <div className="flex flex-col">
            {rows.map((company) => (
              <CompanyRow key={company.id} company={company} live={live} onDraftOpener={draftOpener} />
            ))}
            <div ref={sentinel} className="flex h-10 items-center justify-center">
              {isFetchingNextPage && <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" />}
            </div>
          </div>
        )}
      </div>

      {/* The dock: filters and export float over the list, in glass. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-3 sm:bottom-6">
        <div className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1 rounded-[24px] p-1.5 motion-safe:animate-rise sm:flex-nowrap sm:rounded-full">
          <div className="relative w-full sm:w-64">
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
              placeholder="Filter companies and emails"
              aria-label="Filter companies and emails"
              className="h-9 w-full rounded-full bg-foreground/[0.045] pr-9 pl-9 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] focus-visible:ring-[3px] focus-visible:ring-ring/25"
            />
            {text && (
              <button
                type="button"
                aria-label="Clear filter"
                onClick={() => setText('')}
                className="absolute top-1/2 right-2.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/40 text-background hover:bg-muted-foreground/60"
              >
                <X className="size-2.5" strokeWidth={3} />
              </button>
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
          <span className="hidden min-w-24 items-center justify-end gap-1.5 px-3 text-xs tabular-nums text-muted-foreground sm:flex">
            {companies.isFetching && !companies.isPending && <Loader2 className="size-3 motion-safe:animate-spin" />}
            {companies.data &&
              (filtered ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)}` : `${formatNumber(total)} companies`)}
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
