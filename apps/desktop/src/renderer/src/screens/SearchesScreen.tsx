import { Globe, MapPin, Plus, Rocket, Search as SearchIcon } from 'lucide-react';
import { PageHeader } from '@/components/AppShell';
import { StatusLabel } from '@/components/indicators';
import { progressCaption, SearchProgress } from '@/components/SearchProgress';
import { EmptyState, ErrorState } from '@/components/states';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, formatNumber, relativeTime, searchSubtitle, searchTitle } from '@/lib/format';
import { modKey } from '@/lib/hotkeys';
import { useSearches } from '@/lib/queries';
import { navigate, routeHref } from '@/lib/router';
import type { Search } from '@/lib/types';

const GRID = 'grid grid-cols-[minmax(0,1fr)_minmax(10rem,15rem)_6.5rem_6.5rem] items-center gap-6';

function SearchRow({ search }: { search: Search }) {
  const stopped = search.status === 'failed' || search.status === 'canceled';
  return (
    <a
      href={routeHref({ name: 'search', id: search.id })}
      className={`${GRID} border-b px-5 py-3.5 outline-none transition-colors last:border-b-0 hover:bg-accent/50 focus-visible:bg-accent/60`}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{searchTitle(search)}</div>
        <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
          <StatusLabel status={search.status} />
          <span className="truncate">{searchSubtitle(search)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <SearchProgress search={search} />
        <div className="truncate text-xs text-muted-foreground">
          {search.status === 'failed' ? errorMessage(search.error) : progressCaption(search)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium tabular-nums">{formatNumber(search.emailsFound)}</div>
        <div className="text-xs tabular-nums text-muted-foreground">
          {stopped && search.emailsFound === 0 ? 'no emails' : `${formatNumber(search.emailsValid)} valid`}
        </div>
      </div>
      <div className="text-right text-xs text-muted-foreground">{relativeTime(search.createdAt)}</div>
    </a>
  );
}

function ListSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className={`${GRID} border-b px-5 py-4 last:border-b-0`}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <Skeleton className="h-1.5 w-full" />
          <Skeleton className="ml-auto h-4 w-10" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

function NoSearches() {
  return (
    <EmptyState
      icon={SearchIcon}
      title="Find your first leads"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => navigate({ name: 'new', kind: 'local' })}>
            <MapPin />
            Local businesses
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ name: 'new', kind: 'web' })}>
            <Globe />
            Web search
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate({ name: 'new', kind: 'launches' })}>
            <Rocket />
            New launches
          </Button>
        </>
      }
    >
      Pick where to look. nvoke finds the companies, reads their websites and checks every email it finds.
    </EmptyState>
  );
}

export function SearchesScreen() {
  const { data, error, isPending, refetch } = useSearches();

  return (
    <>
      <PageHeader
        title="Searches"
        subtitle={data && data.length > 0 ? `${data.length} ${data.length === 1 ? 'search' : 'searches'}` : undefined}
        actions={
          <Button size="sm" onClick={() => navigate({ name: 'new', kind: null })}>
            <Plus />
            New search
            <Kbd className="ml-1 border-transparent bg-primary-foreground/15 text-primary-foreground/80">{modKey} N</Kbd>
          </Button>
        }
      />
      <main className="flex-1 overflow-auto px-6 py-5">
        <div className="mx-auto max-w-5xl">
          {isPending ? (
            <ListSkeleton />
          ) : error ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : data.length === 0 ? (
            <NoSearches />
          ) : (
            <>
              <div className={`${GRID} px-5 pb-2 text-xs text-muted-foreground`}>
                <span>Search</span>
                <span>Progress</span>
                <span className="text-right">Emails</span>
                <span className="text-right">Started</span>
              </div>
              <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
                {data.map((s) => (
                  <SearchRow key={s.id} search={s} />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
