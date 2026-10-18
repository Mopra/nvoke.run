'use client';

import { cn } from '@/lib/utils';
import { formatNumber, isActive, percent } from '@/lib/app/desktop';
import type { Search } from '@nvoke/shared';

/** The meter's segments. */
const SEGMENTS = 16;

/**
 * The meter: a row of LED segments, lit from the left. `lit` segments are
 * orange, `dim` ones (lit but not solid) sit between, the rest are off.
 */
export function LedMeter({
  lit,
  dim = 0,
  tone = 'primary',
  pulse = false,
  className,
}: {
  lit: number;
  dim?: number;
  tone?: 'primary' | 'done' | 'failed' | 'canceled';
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex gap-[2px]', className)}>
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-2.5 min-w-0 flex-1 rounded-[1px] bg-foreground/15 transition-colors duration-300',
            i < lit && tone === 'primary' && 'bg-primary',
            i < lit && tone === 'done' && 'bg-foreground/45',
            i < lit && tone === 'failed' && 'bg-destructive/70',
            i < lit && tone === 'canceled' && 'bg-foreground/30',
            i >= lit && i < dim && (tone === 'primary' ? 'bg-primary/30' : 'bg-foreground/25'),
            pulse && i < lit && 'motion-safe:animate-pulse',
          )}
        />
      ))}
    </span>
  );
}

/** How many of the meter's segments a percentage lights. */
export function litSegments(value: number): number {
  return Math.min(SEGMENTS, Math.round((value / 100) * SEGMENTS));
}

/**
 * The pipeline in one meter. The scale is the search limit while companies
 * are still being found, then the number found once the source runs dry. The
 * dim segments are companies found, the solid ones companies crawled. Only
 * running searches take the accent.
 */
export function SearchProgress({ search, className }: { search: Search; className?: string }) {
  const active = isActive(search.status);
  const scale = active ? Math.max(search.limit, search.companiesFound) : Math.max(search.companiesFound, 1);
  const found = percent(search.companiesFound, scale);
  const crawled = percent(search.companiesCrawled, scale);
  const queued = search.status === 'queued';
  const tone = active ? 'primary' : search.status === 'done' ? 'done' : search.status === 'failed' ? 'failed' : 'canceled';

  return (
    <div
      role="progressbar"
      aria-label="Companies crawled"
      aria-valuemin={0}
      aria-valuemax={scale}
      aria-valuenow={search.companiesCrawled}
      className={cn('relative w-full', className)}
    >
      <LedMeter
        lit={queued ? 3 : litSegments(crawled)}
        dim={queued ? 0 : litSegments(found)}
        tone={tone}
        pulse={queued}
        className="h-full items-center"
      />
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
      // A plain words search says what it is doing in its own words.
      if (search.stageNote) return search.stageNote;
      if (search.companiesFound < search.limit && search.companiesCrawled === 0) return `Finding companies, ${found} so far`;
      return `${crawled} of ${found} websites crawled`;
    default:
      return `${found} companies, ${crawled} crawled`;
  }
}
