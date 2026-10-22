import { FREE_PLAN, ICP_EMAIL_WEIGHT, ICP_NAME, PLANS, isPlan, planLabel } from '@nvoke/shared';
import type { Drop, FeedSource, Me, Search, SearchKind, SearchStatus, Verification } from './types';

/** "twice", or "3 times": how often one valid email from Sonar counts (`ICP_EMAIL_WEIGHT`). */
export const ICP_WEIGHT_TIMES = (ICP_EMAIL_WEIGHT as number) === 2 ? 'twice' : `${ICP_EMAIL_WEIGHT} times`;

/** "×3": the weight as the badge on Sonar's keys and tags. */
export const ICP_WEIGHT_BADGE = `×${ICP_EMAIL_WEIGHT}`;

/** The ICP rule in one line, for the plan and billing hints. */
export const ICP_WEIGHT_NOTE = `${ICP_NAME} emails count ${ICP_WEIGHT_TIMES}.`;

export const KIND_LABEL: Record<SearchKind, string> = {
  local: 'Local businesses',
  web: 'Web search',
  launches: 'New launches',
  domains: 'Your list',
  drop: 'Daily drop',
  icp: ICP_NAME,
};

export const FEED_SOURCE_LABEL: Record<FeedSource, string> = {
  show_hn: 'Show HN',
  launch_hn: 'Launch HN',
  product_hunt: 'Product Hunt',
  yc: 'Y Combinator',
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
  catch_all: 'The domain accepts every address, so this one can’t be confirmed.',
  risky: 'Exists, but may bounce or be a shared inbox.',
  invalid: 'The mail server rejects this address.',
  unknown: 'Couldn’t reach the mail server to check.',
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

/**
 * A search that ran more than once is titled by all its runs: one niche in
 * several places lists the places, a list counts every item, anything else
 * is the first run's title with how many more runs followed ("+2").
 */
export function searchTitle(search: Pick<Search, 'kind' | 'params'> | Search): string {
  const runs = searchRuns(search as Search);
  if (runs.length <= 1) return runTitle(search);
  const first = runs[0]!;
  if (search.kind === 'local') {
    const all = runs as { params: Extract<Search, { kind: 'local' }>['params'] }[];
    const niche = all[0]!.params.niche.toLowerCase();
    if (all.every((r) => r.params.niche.toLowerCase() === niche)) {
      const places = [...new Set(all.map((r) => capitalize(r.params.location)))];
      return `${capitalize(all[0]!.params.niche)} in ${joinAnd(places)}`;
    }
  }
  if (search.kind === 'domains') {
    return listTitle([...new Set((runs as { params: Extract<Search, { kind: 'domains' }>['params'] }[]).flatMap((r) => r.params.items))]);
  }
  return `${runTitle({ kind: search.kind, params: first.params } as Search)} +${formatNumber(runs.length - 1)}`;
}

/** One run of a search; its params are of the search's kind. */
export interface SearchRun {
  params: Search['params'];
  limit: number;
  foundBefore: number;
  createdAt: string;
}

/** The runs of a search, oldest first. A search from before runs were kept counts as its one run. */
export function searchRuns(search: Search): SearchRun[] {
  if (search.kind === 'drop') return [];
  if (search.runs && search.runs.length > 0) return search.runs;
  return [{ params: search.params, limit: search.limit, foundBefore: 0, createdAt: search.createdAt }];
}

/** Companies each run added, in run order: the next run's starting count minus this one's. */
export function runsAdded(search: Search): number[] {
  const runs = searchRuns(search);
  return runs.map((run, i) => (runs[i + 1]?.foundBefore ?? search.companiesFound) - run.foundBefore);
}

/** The title of one set of params. */
export function runTitle(search: Pick<Search, 'kind' | 'params'> | Search): string {
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
    case 'domains':
      return listTitle(s.params.items);
    case 'drop':
      return s.params.dropName;
    case 'icp':
      return s.params.description.length > 80 ? `${s.params.description.slice(0, 79).trimEnd()}…` : s.params.description;
  }
  // A kind added on the server after this build shipped.
  return 'Search';
}

/** "Aarhus", "Aarhus and Odense", "Aarhus, Odense and Vejle". */
function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "linear.app", "linear.app and Pleo", "linear.app, Pleo and 5 more". */
export function listTitle(items: string[]): string {
  const [a, b] = items;
  if (items.length <= 1) return a ?? 'An empty list';
  if (items.length === 2) return `${a} and ${b}`;
  return `${a}, ${b} and ${formatNumber(items.length - 2)} more`;
}

export function searchSubtitle(search: Search): string {
  if (search.kind === 'launches') return `${KIND_LABEL.launches}, ${daysLabel(search.params.days)}`;
  if (search.kind === 'domains') return `${KIND_LABEL.domains}, ${formatNumber(search.params.items.length)} ${search.params.items.length === 1 ? 'company' : 'companies'}`;
  if (search.kind === 'drop') return search.params.keyword ? `${KIND_LABEL.drop}, "${search.params.keyword}"` : KIND_LABEL.drop;
  return kindLabel(search.kind);
}

/** The label of a kind, with a fallback for one a newer server sends. */
export function kindLabel(kind: string): string {
  return (KIND_LABEL as Record<string, string | undefined>)[kind] ?? 'Search';
}

export function errorMessage(code: string | null): string {
  if (!code) return 'Stopped before it finished.';
  if (code === 'quota_exceeded') return 'Stopped: this month’s verified emails ran out.';
  if (code === 'source_unavailable') return 'Stopped: web search is paused on our side. We know and we’re on it.';
  return 'Stopped by an error on our end. Run it again.';
}

export function capitalize(text: string): string {
  const t = text.trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const numberFormat = new Intl.NumberFormat('en-US');
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

/**
 * "Free plan", "2,500 plan, $19 a month", or for a plan this build does not
 * know yet (the server's ladder moved on) the allowance it reports, no price.
 */
export function planSettingLabel(me: Pick<Me, 'plan' | 'usage'>): string {
  if (me.plan === FREE_PLAN) return 'Free plan';
  if (!isPlan(me.plan)) return `${formatNumber(me.usage.emailsLimit)} plan`;
  return `${planLabel(me.plan)} plan, $${PLANS[me.plan].priceUsd} a month`;
}

export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, (part / whole) * 100));
}

/** "Offline, synced 42 min ago" while the server is out of reach, else null. */
export function offlineCaption(status: { online: boolean | null; syncedAt: string | null } | undefined, now = Date.now()): string | null {
  if (status?.online !== false) return null;
  return status.syncedAt ? `Offline, synced ${relativeTime(status.syncedAt, now)}` : 'Offline';
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

/** "Show HN and Y Combinator", or "every source". */
export function sourcesLabel(sources: FeedSource[], all: number): string {
  if (sources.length >= all) return 'every source';
  const names = sources.map((s) => FEED_SOURCE_LABEL[s]);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** When a drop runs next: "Paused", "Checking any minute", "Next in 5 h", "Next tomorrow at 07:00". */
export function nextRunLabel(drop: Pick<Drop, 'enabled' | 'nextRunAt'>, now: number = Date.now()): string {
  if (!drop.enabled) return 'Paused';
  const at = new Date(drop.nextRunAt).getTime();
  const minutes = Math.round((at - now) / 60_000);
  if (minutes <= 1) return 'Checking any minute';
  if (minutes < 60) return `Next in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 12) return `Next in ${hours} h`;
  const time = new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return new Date(at).getDate() === new Date(now).getDate() ? `Next today at ${time}` : `Next tomorrow at ${time}`;
}
