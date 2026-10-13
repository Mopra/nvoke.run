import { cn } from '@/lib/utils';
import { formatNumber, isActive, percent } from '@/lib/format';
import type { Search } from '@/lib/types';

/**
 * The pipeline in one bar. The track is the search limit while companies are
 * still being found, then the number found once the source runs dry. The pale
 * layer is companies found, the sage layer is companies crawled.
 */
export function SearchProgress({ search, className }: { search: Search; className?: string }) {
  const active = isActive(search.status);
  const scale = active ? Math.max(search.limit, search.companiesFound) : Math.max(search.companiesFound, 1);
  const found = percent(search.companiesFound, scale);
  const crawled = percent(search.companiesCrawled, scale);
  const queued = search.status === 'queued';

  return (
    <div
      role="progressbar"
      aria-label="Companies crawled"
      aria-valuemin={0}
      aria-valuemax={scale}
      aria-valuenow={search.companiesCrawled}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      {queued ? (
        <div className="absolute inset-y-0 left-0 w-1/4 rounded-full bg-muted-foreground/20 motion-safe:animate-[nvoke-indeterminate_1.4s_ease-in-out_infinite]" />
      ) : (
        <>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20 transition-[width] duration-700 ease-out"
            style={{ width: `${found}%` }}
          />
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out',
              search.status === 'failed' || search.status === 'canceled' ? 'bg-muted-foreground/50' : 'bg-ring',
            )}
            style={{ width: `${crawled}%` }}
          />
        </>
      )}
    </div>
  );
}

/** One line under the bar: what the pipeline is doing right now. */
export function progressCaption(search: Search): string {
  const found = formatNumber(search.companiesFound);
  const crawled = formatNumber(search.companiesCrawled);
  switch (search.status) {
    case 'queued':
      return 'Waiting for a worker';
    case 'running':
      if (search.companiesFound < search.limit && search.companiesCrawled === 0) return `Finding companies, ${found} so far`;
      return `${crawled} of ${found} websites crawled`;
    default:
      return `${found} companies, ${crawled} crawled`;
  }
}
