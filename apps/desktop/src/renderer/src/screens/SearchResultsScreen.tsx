import { useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowLeft,
  Ban,
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
import { StatusLabel, VERIFICATION_DOT, VerificationBadge } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { EmptyState, ErrorState } from '@/components/states';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
import { Input } from '@/components/ui/input';
import { Kbd } from '@/components/ui/kbd';
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
import { useCancelSearch, useCompanies, useDeleteSearch, useSearch } from '@/lib/queries';
import { navigate } from '@/lib/router';
import type { Company, Email, EmailKind, Search, Verification } from '@/lib/types';
import { cn } from '@/lib/utils';

const COLUMNS = 'grid grid-cols-[minmax(13rem,1fr)_minmax(19rem,1.5fr)_minmax(9rem,0.7fr)_4.5rem] gap-5';

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

/* Header */

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold tabular-nums tracking-tight">{formatNumber(value)}</span>
        {sub && <span className="truncate text-xs text-muted-foreground">{sub}</span>}
      </div>
    </div>
  );
}

function Overview({ search }: { search: Search }) {
  const active = isActive(search.status);
  const validShare = search.emailsFound > 0 ? Math.round((search.emailsValid / search.emailsFound) * 100) : null;
  return (
    <section className="shrink-0 border-b px-6 py-4">
      <div className="grid grid-cols-4 gap-6">
        <Stat label="Companies" value={search.companiesFound} sub={`of ${formatNumber(search.limit)} max`} />
        <Stat label="Websites crawled" value={search.companiesCrawled} />
        <Stat label="Emails found" value={search.emailsFound} />
        <Stat label="Valid emails" value={search.emailsValid} sub={validShare === null ? undefined : `${validShare}%`} />
      </div>
      {active && (
        <div className="mt-4 flex items-center gap-4">
          <SearchProgress search={search} className="flex-1" />
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{progressCaption(search)}</span>
        </div>
      )}
      {search.status === 'failed' && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
          <TriangleAlert className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">
            {errorMessage(search.error)} The results found until then are kept below.
          </span>
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
        onClick={() => void copy(email.address, email.address)}
        className="flex min-w-0 items-center gap-1.5 rounded text-left text-[13px] outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        title="Copy email"
      >
        <span className="truncate">{email.address}</span>
        <Copy className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/email:opacity-100" />
      </button>
      {email.kind === 'personal' && <span className="shrink-0 text-[11px] text-muted-foreground">person</span>}
      <span className="ml-auto" />
      <VerificationBadge value={email.verification} pending={checking && email.checkedAt === null} />
    </div>
  );
}

function EmailsCell({ company, live }: { company: Company; live: boolean }) {
  if (company.crawlStatus === 'pending') {
    return (
      <span className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3 motion-safe:animate-spin" />
        Waiting to crawl
      </span>
    );
  }
  if (company.crawlStatus === 'blocked')
    return <span className="text-[13px] text-muted-foreground">The site asks crawlers to stay out</span>;
  if (company.crawlStatus === 'failed')
    return <span className="text-[13px] text-muted-foreground">The site could not be reached</span>;
  if (company.emails.length === 0) return <span className="text-[13px] text-muted-foreground">No public email</span>;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {company.emails.map((e) => (
        <EmailLine key={e.id} email={e} checking={live} />
      ))}
    </div>
  );
}

function CompanyRow({ company, live }: { company: Company; live: boolean }) {
  const source = SOURCE_LABEL[company.source] ?? company.source;
  return (
    <div data-selectable className={`${COLUMNS} items-start border-b px-6 py-2.5 hover:bg-accent/40`}>
      <div className="min-w-0 leading-5">
        <div className="truncate text-[13px] font-medium">{company.name}</div>
        <button
          type="button"
          onClick={() => void api.openExternal(company.website)}
          className="block max-w-full truncate rounded text-left text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {company.domain}
        </button>
      </div>
      <EmailsCell company={company} live={live} />
      <div className="min-w-0 text-xs leading-5 text-muted-foreground">
        <div className="truncate">{company.location ?? source}</div>
        {company.phone && <div className="truncate tabular-nums">{company.phone}</div>}
      </div>
      <div className="-my-1 flex justify-end gap-0.5">
        {company.emails.length > 1 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
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
              size="icon"
              className="size-7 text-muted-foreground"
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
  );
}

function TableSkeleton() {
  return (
    <div>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={`${COLUMNS} border-b px-6 py-3.5`}>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-5 w-14 rounded-full" />
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
        <Button variant="outline" size="sm" className={cn(value && 'border-ring/60')}>
          {value ? <span className={cn('size-1.5 rounded-full', VERIFICATION_DOT[value])} /> : null}
          {value ? VERIFICATION_LABEL[value] : 'Any verification'}
        </Button>
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

function KindFilter({ value, onChange }: { value: EmailKind | undefined; onChange: (v: EmailKind | undefined) => void }) {
  const options: [EmailKind | undefined, string][] = [
    [undefined, 'All'],
    ['generic', 'Generic'],
    ['personal', 'Personal'],
  ];
  return (
    <div role="radiogroup" aria-label="Email kind" className="inline-flex h-8 rounded-md bg-muted p-[3px]">
      {options.map(([v, label]) => (
        <button
          key={label}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            'rounded px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
            value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* Screen */

export function SearchResultsScreen({ id }: { id: string }) {
  const searchQuery = useSearch(id);
  const search = searchQuery.data;
  const [text, setText] = useState('');
  const [verification, setVerification] = useState<Verification | undefined>();
  const [kind, setKind] = useState<EmailKind | undefined>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const q = useDebounced(text.trim(), 250);
  const live = search ? isActive(search.status) : false;
  const companies = useCompanies(id, { q: q || undefined, verification, kind }, live);
  const cancel = useCancelSearch();
  const remove = useDeleteSearch();
  const filterRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = companies.data?.pages.flatMap((p) => p.items) ?? [];
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
      }
    } catch (err) {
      toast.error('Export failed', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  }

  function doCancel(): void {
    cancel.mutate(id, {
      onSuccess: () => toast('Search canceled', { description: 'Results found so far are kept.' }),
      onError: (err) => toast.error('Could not cancel', { description: err.message }),
    });
  }

  function doDelete(): void {
    remove.mutate(id, {
      onSuccess: () => {
        toast('Search deleted');
        navigate({ name: 'searches' }, { replace: true });
      },
      onError: (err) => toast.error('Could not delete', { description: err.message }),
    });
  }

  const back = (
    <Button
      variant="ghost"
      size="icon"
      className="-ml-2 size-8 text-muted-foreground"
      aria-label="Back to searches"
      onClick={() => navigate({ name: 'searches' })}
    >
      <ArrowLeft />
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
            actions={
              <Button variant="outline" size="sm" onClick={() => navigate({ name: 'searches' })}>
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
        <div className="grid grid-cols-4 gap-6 border-b px-6 py-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-14" />
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
          <span className="flex items-center gap-3">
            <StatusLabel status={search.status} />
            <span className="truncate">
              {searchSubtitle(search)}, {timing}
            </span>
          </span>
        }
        actions={
          <>
            {live && (
              <Button variant="outline" size="sm" onClick={doCancel} disabled={cancel.isPending}>
                <Ban />
                Stop
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" onClick={() => void doExport()} disabled={exporting || search.emailsFound === 0}>
                  {exporting ? <Loader2 className="animate-spin" /> : <Download />}
                  Export CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                One row per email. <Kbd className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground/80">{modKey} E</Kbd>
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label="More actions">
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

      <div className="flex shrink-0 items-center gap-2 border-b px-6 py-2.5">
        <div className="relative w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
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
            className="h-8 pr-12 pl-8 text-[13px]"
          />
          {text ? (
            <button
              type="button"
              aria-label="Clear filter"
              onClick={() => setText('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <Kbd className="absolute top-1/2 right-2 -translate-y-1/2">{modKey} F</Kbd>
          )}
        </div>
        <VerificationFilter value={verification} onChange={setVerification} />
        <KindFilter value={kind} onChange={setKind} />
        <div className="ml-auto flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
          {companies.isFetching && !companies.isPending && <Loader2 className="size-3 animate-spin" />}
          {companies.data &&
            (filtered
              ? `${formatNumber(total)} of ${formatNumber(search.companiesFound)} companies`
              : `${formatNumber(total)} companies`)}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]">
        <div
          className={`${COLUMNS} sticky top-0 z-10 border-b bg-background/95 px-6 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm`}
        >
          <span>Company</span>
          <span>Emails</span>
          <span>{search.kind === 'local' ? 'Location' : 'Found on'}</span>
          <span />
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
              actions={
                <Button
                  variant="outline"
                  size="sm"
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

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this search?</AlertDialogTitle>
            <AlertDialogDescription>
              {searchTitle(search)} and its {formatNumber(search.companiesFound)} companies and{' '}
              {formatNumber(search.emailsFound)} emails are removed for good. Emails already counted toward your plan
              stay counted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete}>Delete search</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
