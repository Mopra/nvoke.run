import type { Search, SearchKind, SearchStatus, Verification } from './types';

export const KIND_LABEL: Record<SearchKind, string> = {
  local: 'Local businesses',
  web: 'Web search',
  launches: 'New launches',
};

export const STATUS_LABEL: Record<SearchStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
};

export const VERIFICATION_LABEL: Record<Verification, string> = {
  valid: 'Valid',
  catch_all: 'Catch-all',
  risky: 'Risky',
  invalid: 'Invalid',
  unknown: 'Unknown',
};

export const VERIFICATION_HINT: Record<Verification, string> = {
  valid: 'The mail server accepts this address.',
  catch_all: 'The domain accepts every address, so this one cannot be confirmed.',
  risky: 'The address exists but may bounce or belong to a shared role.',
  invalid: 'The mail server rejects this address.',
  unknown: 'The mail server could not be checked.',
};

/** The time windows the new search form offers for launches. The API takes `days`. */
export type LaunchWindow = 'day' | 'week' | 'month';

export const WINDOW_DAYS: Record<LaunchWindow, number> = { day: 1, week: 7, month: 30 };

export const WINDOW_LABEL: Record<LaunchWindow, string> = {
  day: 'Last 24 hours',
  week: 'Last 7 days',
  month: 'Last 30 days',
};

/** "last 7 days" for a launches search. The server defaults `days` to 7. */
export function daysLabel(days: number | undefined): string {
  const d = days ?? 7;
  return d === 1 ? 'last 24 hours' : `last ${d} days`;
}

export function isActive(status: SearchStatus): boolean {
  return status === 'queued' || status === 'running';
}

export function searchTitle(search: Pick<Search, 'kind' | 'params'> | Search): string {
  const s = search as Search;
  switch (s.kind) {
    case 'local':
      return `${capitalize(s.params.niche)} in ${capitalize(s.params.location)}`;
    case 'web':
      return s.params.country ? `"${s.params.keyword}" in ${s.params.country.toUpperCase()}` : `"${s.params.keyword}"`;
    case 'launches':
      return s.params.keyword
        ? `Launches matching "${s.params.keyword}"`
        : `All launches, ${daysLabel(s.params.days)}`;
  }
}

export function searchSubtitle(search: Search): string {
  if (search.kind === 'launches') return `${KIND_LABEL.launches}, ${daysLabel(search.params.days)}`;
  return KIND_LABEL[search.kind];
}

export function errorMessage(code: string | null): string {
  if (!code) return 'The search stopped before it finished.';
  if (code === 'quota_exceeded') return "Stopped because this month's verified emails ran out.";
  return 'The search stopped because of an error on our side.';
}

export function capitalize(text: string): string {
  const t = text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const numberFormat = new Intl.NumberFormat('en-US');
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diff = Math.round((now - new Date(iso).getTime()) / 1000);
  if (diff < 45) return 'just now';
  const minutes = Math.round(diff / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function duration(fromIso: string, toIso: string | null, now: number = Date.now()): string {
  const end = toIso ? new Date(toIso).getTime() : now;
  const seconds = Math.max(0, Math.round((end - new Date(fromIso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function csvFileName(search: Search): string {
  const slug = searchTitle(search)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `nvoke-${slug || search.id}.csv`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

export function resetDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return '';
  return new Date(y, m, 1).toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}
