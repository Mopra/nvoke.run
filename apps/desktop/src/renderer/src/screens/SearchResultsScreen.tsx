import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Ban,
  ChevronDown,
  ChevronLeft,
  Copy,
  Download,
  ExternalLink,
  Inbox,
  Loader2,
  MoreHorizontal,
  Radar,
  SearchX,
  Search as SearchIcon,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/AppShell';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { StatusLabel, VERIFICATION_DOT, VerificationBadge } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
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
import {
  csvFileName,
  duration,
  errorMessage,
  formatNumber,
  isActive,
  relativeTime,
  searchSubtitle,
  searchTitle,
  VERIFICATION_LABEL,
} from '@/lib/format';
import { modKey, useModHotkey } from '@/lib/hotkeys';
import { useCancelSearch, useCompanies, useSearch } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { Company, Email, EmailKind, Search, Verification } from '@/lib/types';
import { cn } from '@/lib/utils';

const COLUMNS = 'grid grid-cols-[minmax(12rem,1fr)_minmax(19rem,1.6fr)_minmax(8rem,0.6fr)_4rem] gap-6';

const SOURCE_LABEL: Record<string, string> = {
  openstreetmap: 'OpenStreetMap',
  brave: 'Web search',
  producthunt: 'Product Hunt',
  hackernews: 'Show HN',
};

const VERIFICATION_ORDER: Verification[] = ['valid', 'catch_all', 'risky', 'unknown', 'invalid'];

async function copy(text: string, what: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${what}`);
  } catch {
    toast.error('Could not copy to the clipboard');
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
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums">{formatNumber(value)}</span>
        {sub && <span className="truncate text-xs tabular-nums text-muted-foreground">{sub}</span>}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Overview({ search }: { search: Search }) {
  const active = isActive(search.status);
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  return (
    <section className="shrink-0 px-6 pt-2 pb-5">
      <div className="grid grid-cols-4 gap-6">
        <Stat label="Companies" value={search.companiesFound} sub={`of ${formatNumber(search.limit)}`} />
        <Stat label="Websites crawled" value={search.companiesCrawled} />
        <Stat label="Emails found" value={search.emailsFound} />
        <Stat label="Valid emails" value={search.emailsValid} sub={validShare === null ? undefined : `${validShare}%`} />
      </div>
      {active && (
        <div className="mt-5 flex items-center gap-4">
          <SearchProgress search={search} className="h-1.5 flex-1" />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
        </div>
      )}
      {search.status === 'failed' && (
        <div className="mt-5 flex items-center gap-3 rounded-lg bg-destructive/8 px-3.5 py-2.5 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">{errorMessage(search.error)} The results found until then are kept below.</span>
          {search.error === 'quota_exceeded' && (
            <Button size="sm" variant="outline" onClick={() => navigate({ name: 'account' })}>
              View plan
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

function EmailsCell({ company, live }: { company: Company; live: boolean }) {
  const quiet = 'text-xs leading-5 text-muted-foreground';
  if (company.crawlStatus === 'pending') {
    return (
      <span className={cn(quiet, 'inline-flex items-center gap-2')}>
        <Loader2 className="size-3 motion-safe:animate-spin" />
        Waiting to crawl
      </span>
    );
  }
  if (company.crawlStatus === 'blocked') return <span className={quiet}>The site asks crawlers to stay out</span>;
  if (company.crawlStatus === 'failed') return <span className={quiet}>The site could not be reached</span>;
  if (company.emails.length === 0) return <span className={quiet}>No public email</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {company.emails.map((e) => (
        <EmailLine key={e.id} email={e} checking={live} />
      ))}
    </div>
  );
}

function CompanyRow({ company, live }: { company: Company; live: boolean }) {
  const source = SOURCE_LABEL[company.source] ?? company.source;
  return (
    <div className="px-3">
      <div
        data-selectable
        className={cn(
          COLUMNS,
          'group items-start rounded-lg px-3 py-2.5 transition-colors duration-100 hover:bg-accent',
        )}
      >
        <div className="min-w-0 leading-5">
          <div className="truncate text-sm font-medium">{company.name}</div>
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
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="px-3">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, 'px-3 py-3.5')}>
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
            'inline-flex h-7 items-center gap-1.5 rounded-[8px] px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
            value
              ? 'bg-primary/10 text-foreground dark:bg-primary/20'
              : 'bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.08] hover:text-foreground',
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

export function SearchResultsScreen({ id }: { id: string }) {
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState('');
  const [verification, setVerification] = useState<Verification | undefined>();
  const [kind, setKind] = useState<EmailKind | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;
  const companies = useCompanies(id, { q: q || undefined, verification, kind }, live);
  const cancel = useCancelSearch();
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = companies.data?.pages.flatMap((p) => p.companies) ?? [];
  const total = companies.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(q || verification || kind);

  // TanStack Virtual returns fresh functions each render; the compiler lint knows.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 58,
    overscan: 12,
    getItemKey: (index) => rows[index]?.id ?? index,
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items[items.length - 1]?.index ?? 0;
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = companies;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 25) void fetchNextPage();
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [q, verification, kind]);

  useModHotkey('f', () => {
    filterRef.current?.focus();
    filterRef.current?.select();
  });
  useModHotkey('e', () => void doExport(), Boolean(search));

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

  function doCancel(): void {
    cancel.mutate(id, {
      onSuccess: () => toast('Search stopped', { description: 'Results found so far are kept.' }),
      onError: (err) => toast.error('Could not stop the search', { description: err.message }),
    });
  }

  const back = (
    <Button
      variant="ghost"
      size="icon-sm"
      className="-ml-1.5 text-muted-foreground"
      aria-label="Back to searches"
      onClick={() => navigate({ name: 'searches' })}
    >
      <ChevronLeft className="size-[18px]" />
    </Button>
  );

  if (searchQuery.error) {
    const missing = searchQuery.error instanceof ApiError && searchQuery.error.status === 404;
    return (
      <>
        <PageHeader leading={back} title="Search" />
        {missing ? (
          <EmptyState
            icon={SearchX}
            title="This search no longer exists"
            action={
              <Button variant="outline" onClick={() => navigate({ name: 'searches' })}>
                Back to searches
              </Button>
            }
          >
            It may have been deleted on another device.
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
        <PageHeader leading={back} title={<Skeleton className="h-4 w-56" />} />
        <div className="grid grid-cols-4 gap-6 px-6 pt-2 pb-5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-6 w-14" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </div>
        <TableSkeleton />
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
        title={searchTitle(search)}
        subtitle={
          <span className="flex items-center gap-2">
            <StatusLabel status={search.status} />
            <span className="truncate">
              {searchSubtitle(search)}, {timing}
            </span>
          </span>
        }
        actions={
          <>
            {live && (
              <Button variant="ghost" size="sm" onClick={doCancel} disabled={cancel.isPending}>
                <Ban />
                Stop
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => void doExport()} disabled={exporting || search.emailsFound === 0}>
                  {exporting ? <Loader2 className="motion-safe:animate-spin" /> : <Download />}
                  Export CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                One row per email <Kbd>{modKey} E</Kbd>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                  <Trash2 />
                  Delete search
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Overview search={search} />

      <div
        className={cn(
          'relative z-10 flex shrink-0 items-center gap-2 px-6 pb-3 transition-shadow duration-200',
          scrolled && 'shadow-[0_1px_0_var(--border)]',
        )}
      >
        {/* Command bar style filter. */}
        <div className="relative w-80">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
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
            className="h-7 w-full rounded-[8px] bg-foreground/[0.05] pr-12 pl-8 text-sm outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus-visible:bg-card focus-visible:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/25 dark:focus-visible:bg-foreground/10"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setText('')}
              className="absolute top-1/2 right-1.5 flex size-4 -translate-y-1/2 items-center justify-center rounded-full bg-muted-foreground/40 text-background hover:bg-muted-foreground/60"
            >
              <X className="size-2.5" strokeWidth={3} />
            </button>
          ) : (
            <Kbd className="absolute top-1/2 right-1.5 -translate-y-1/2 bg-transparent">{modKey} F</Kbd>
          )}
        </div>
        <VerificationFilter value={verification} onChange={setVerification} />
        <Segmented<KindOption>
          label="Email kind"
          size="sm"
          value={kind ?? 'all'}
          onChange={(v) => setKind(v === 'all' ? undefined : v)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'generic', label: 'Generic' },
            { value: 'personal', label: 'Personal' },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {companies.isFetching && !companies.isPending && <Loader2 className="size-3 motion-safe:animate-spin" />}
          {companies.data &&
            (filtered
              ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)} companies`
              : `${formatNumber(total)} companies`)}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 2)}
        className="min-h-0 flex-1 overflow-auto pb-4 [scrollbar-gutter:stable]"
      >
        <div className="sticky top-0 z-10 bg-background/85 px-3 backdrop-blur-xl">
          <div className={cn(COLUMNS, 'px-3 py-1.5 text-xs font-medium text-muted-foreground')}>
            <span>Company</span>
            <span>Emails</span>
            <span>{search.kind === 'local' ? 'Location' : 'Found on'}</span>
            <span />
          </div>
        </div>
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
              They appear here as soon as they are found.
            </EmptyState>
          ) : (
            <EmptyState icon={Inbox} title="No companies found">
              Try a broader keyword or a larger area.
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
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <CompanyRow company={rows[item.index]!} live={live} />
              </div>
            ))}
          </div>
        )}
      </div>

      <DeleteSearchDialog
        search={search}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={() => navigate({ name: 'searches' }, { replace: true })}
      />
    </>
  );
}
