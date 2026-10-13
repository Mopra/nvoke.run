import { useRef, useState } from 'react';
import { ArrowUpRight, Ban, MoreHorizontal, Plus, Rows3, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LargeTitle, PageHeader } from '@/components/AppShell';
import { DeleteSearchDialog } from '@/components/DeleteSearchDialog';
import { StatusDot } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { errorMessage, formatNumber, isActive, relativeTime, searchSubtitle, searchTitle, STATUS_LABEL } from '@/lib/format';
import { modKey } from '@/lib/hotkeys';
import { useCancelSearch, useSearches } from '@/lib/queries';
import { navigate, routeHref } from '@/lib/router';
import type { Search } from '@/lib/types';
import { useScrolled } from '@/lib/use-scrolled';
import { cn } from '@/lib/utils';

const GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(10rem,17rem)_4.5rem_5.5rem_1.75rem] items-center gap-6';

function RowMenu({ search }: { search: Search }) {
  const [confirm, setConfirm] = useState(false);
  const cancel = useCancelSearch();
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${searchTitle(search)}`}
            className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-accent data-[state=open]:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onSelect={() => navigate({ name: 'search', id: search.id })}>
            <ArrowUpRight />
            Open
          </DropdownMenuItem>
          {isActive(search.status) && (
            <DropdownMenuItem
              onSelect={() =>
                cancel.mutate(search.id, {
                  onSuccess: () => toast('Search stopped', { description: 'Results found so far are kept.' }),
                  onError: (err) => toast.error('Could not stop the search', { description: err.message }),
                })
              }
            >
              <Ban />
              Stop search
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteSearchDialog search={search} open={confirm} onOpenChange={setConfirm} />
    </>
  );
}

function SearchRow({ search }: { search: Search }) {
  const stopped = search.status === 'failed' || search.status === 'canceled';
  return (
    <div className="group relative rounded-lg transition-colors duration-100 hover:bg-accent has-[a:focus-visible]:bg-accent">
      <a
        href={routeHref({ name: 'search', id: search.id })}
        aria-label={searchTitle(search)}
        className="absolute inset-0 rounded-lg outline-none"
      />
      <div className={cn(GRID, 'pointer-events-none relative px-3 py-3')}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex w-3 justify-center">
            <StatusDot status={search.status} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{searchTitle(search)}</div>
            <div className="truncate text-xs text-muted-foreground">
              {STATUS_LABEL[search.status]}, {searchSubtitle(search).toLowerCase()}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <SearchProgress search={search} />
          <div className="truncate text-xs text-muted-foreground">
            {search.status === 'failed' ? errorMessage(search.error) : progressCaption(search)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold tabular-nums">{formatNumber(search.emailsFound)}</div>
          <div className="text-xs tabular-nums text-muted-foreground">
            {stopped && search.emailsFound === 0 ? 'no emails' : `${formatNumber(search.emailsValid)} valid`}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">{relativeTime(search.createdAt)}</div>
        <div className="pointer-events-auto flex justify-end">
          <RowMenu search={search} />
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={cn(GRID, 'px-3 py-3.5')}>
          <div className="flex items-center gap-3">
            <Skeleton className="size-2 rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-1 w-full rounded-full" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="ml-auto h-3.5 w-8" />
          <Skeleton className="ml-auto h-2.5 w-12" />
          <span />
        </div>
      ))}
    </div>
  );
}

function Section({ title, searches }: { title: string; searches: Search[] }) {
  if (searches.length === 0) return null;
  return (
    <section className="flex flex-col [&+&]:mt-6">
      <h2 className="px-3 pb-1.5 text-xs font-semibold text-muted-foreground">{title}</h2>
      <div className="flex flex-col gap-px">
        {searches.map((s) => (
          <SearchRow key={s.id} search={s} />
        ))}
      </div>
    </section>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();
  const scrollRef = useRef<HTMLElement>(null);
  const scrolled = useScrolled(scrollRef);
  const active = data?.filter((s) => isActive(s.status)) ?? [];
  const earlier = data?.filter((s) => !isActive(s.status)) ?? [];

  const subtitle =
    data && data.length > 0
      ? `${data.length} ${data.length === 1 ? 'search' : 'searches'}${active.length ? `, ${active.length} running` : ''}`
      : undefined;

  return (
    <>
      <PageHeader
        title="Searches"
        divider={scrolled}
        titleHidden={!scrolled}
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={() => navigate({ name: 'new', kind: null })}>
                <Plus />
                New search
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Start a search <Kbd>{modKey} N</Kbd>
            </TooltipContent>
          </Tooltip>
        }
      />
      <main ref={scrollRef} className="flex-1 overflow-auto px-5 pb-8">
        <div className="mx-auto max-w-[920px] motion-safe:animate-page-in">
          <LargeTitle className="px-3" subtitle={subtitle ?? 'Loading'}>
            Searches
          </LargeTitle>
          {isPending ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : data.length === 0 ? (
            <EmptyState
              icon={Rows3}
              title="No searches yet"
              action={
                <Button onClick={() => navigate({ name: 'new', kind: null })}>
                  <Plus />
                  New search
                </Button>
              }
            >
              Start one and the leads arrive here while nvoke works.
            </EmptyState>
          ) : (
            <>
              <Section title="In progress" searches={active} />
              <Section title={active.length ? 'Earlier' : 'All searches'} searches={earlier} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
