import {
  DROP_DAILY_LIMIT_DEFAULT,
  DROP_DAILY_LIMIT_MAX,
  FEED_SOURCES,
  type CreateDropRequest,
  type Drop,
  type DropListResponse,
  type FeedSource,
  type FeedSourceStatus,
  type Search,
  type UpdateDropRequest,
} from '@nvoke/shared';
import { capitalize, formatNumber, isActive, sourcesLabel } from './desktop';

/**
 * Drops in the web app: the paths, the drop form as data and the small
 * readings the screens show. A drop's runs are its searches of kind `drop`,
 * so they come from the searches list, not from a route of their own.
 */

export const DROPS_PATH = '/app/drops';
export const NEW_DROP_PATH = '/app/drops/new';
export const dropPath = (id: string): string => `${DROPS_PATH}/${encodeURIComponent(id)}`;

/** The knob's ticks for the daily limit, ending at the plan's `max`. */
export function dropLimitPresets(max: number = DROP_DAILY_LIMIT_MAX): number[] {
  return [...[10, 25, 50, 100].filter((p) => p < max), max];
}

/** A run is due within this long of `nextRunAt`: the worker picks drops up every minute. */
const DUE_MS = 60_000;

/** Polls the drop list while a run is due, so the delivery lands on screen without a reload. */
export const DROPS_POLL_MS = 15_000;

/** The searches a drop delivered, newest first. */
export function dropRuns(searches: Search[] | undefined, dropId: string): Search[] {
  return (searches ?? [])
    .filter((s) => s.kind === 'drop' && s.params.dropId === dropId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** What a drop watches, as one line: `"ai agents" from Show HN and Y Combinator, up to 25 a day`. */
export function dropSummary(drop: Pick<Drop, 'keyword' | 'sources' | 'dailyLimit'>): string {
  const what = drop.keyword ? `"${drop.keyword}"` : 'Every launch';
  return `${what} from ${sourcesLabel(drop.sources, FEED_SOURCES.length)}, up to ${formatNumber(drop.dailyLimit)} a day`;
}

/** Launches collected this week across the sources the server can collect. */
export function feedTotal(sources: FeedSourceStatus[]): number {
  return sources.filter((s) => s.available).reduce((sum, s) => sum + s.lastWeek, 0);
}

export function sourceAvailable(sources: FeedSourceStatus[], source: FeedSource): boolean {
  return sources.find((s) => s.source === source)?.available ?? true;
}

/**
 * Where a drop stands: `running` while a run it made is crawling, `due` when
 * the worker picks it up any minute, `daily` between runs, `paused` when off.
 */
export type DropState = 'running' | 'due' | 'daily' | 'paused';

export function dropState(drop: Pick<Drop, 'enabled' | 'nextRunAt'>, runs: Search[] = [], now: number = Date.now()): DropState {
  if (runs.some((r) => isActive(r.status))) return 'running';
  if (!drop.enabled) return 'paused';
  return new Date(drop.nextRunAt).getTime() - now <= DUE_MS ? 'due' : 'daily';
}

export const DROP_STATE_LABEL: Record<DropState, string> = {
  running: 'Delivering',
  due: 'Checking',
  daily: 'Daily',
  paused: 'Paused',
};

/** The poll for the drop list: on while an enabled drop is due, off otherwise (the list changes when the user acts). */
export function dropsPollInterval(data: DropListResponse | undefined, now: number = Date.now()): number | false {
  if (!data) return false;
  return data.drops.some((d) => dropState(d, [], now) === 'due') ? DROPS_POLL_MS : false;
}

/** The drop form, as typed. */
export interface DropForm {
  keyword: string;
  sources: FeedSource[];
  /** NaN while the field is empty. */
  limit: number;
  name: string;
}

/** A form for an existing drop, or a new one: the keyword it was opened with and every source the server collects. */
export function dropForm(drop: Drop | undefined, sources: FeedSourceStatus[], keyword = ''): DropForm {
  if (drop) return { keyword: drop.keyword ?? '', sources: drop.sources, limit: drop.dailyLimit, name: drop.name };
  return { keyword, sources: FEED_SOURCES.filter((s) => sourceAvailable(sources, s)), limit: DROP_DAILY_LIMIT_DEFAULT, name: '' };
}

/** Picks or drops a source, keeping the feed's own order. */
export function toggleSource(list: FeedSource[], source: FeedSource): FeedSource[] {
  return list.includes(source) ? list.filter((s) => s !== source) : FEED_SOURCES.filter((s) => s === source || list.includes(s));
}

/** The name a drop gets when the name is left empty. */
export function autoName(keyword: string): string {
  const k = keyword.trim();
  return k ? capitalize(k) : 'Every launch';
}

/** The daily limit the server accepts: a whole number from 1 to the plan's `max`, the default when empty. */
export function clampLimit(limit: number, max: number = DROP_DAILY_LIMIT_MAX): number {
  return Math.min(max, Math.max(1, Math.round(limit) || DROP_DAILY_LIMIT_DEFAULT));
}

/** What is wrong with the form, or null when it can be saved. */
export function dropFormProblem(form: DropForm): string | null {
  return form.sources.length === 0 ? 'Pick at least one source.' : null;
}

export function buildCreateDrop(form: DropForm, max?: number): CreateDropRequest | null {
  if (dropFormProblem(form)) return null;
  const keyword = form.keyword.trim();
  return {
    name: form.name.trim() || autoName(keyword),
    ...(keyword ? { keyword } : {}),
    sources: form.sources,
    dailyLimit: clampLimit(form.limit, max),
  };
}

/** The whole form as an update; an emptied keyword removes it. */
export function buildUpdateDrop(form: DropForm, max?: number): UpdateDropRequest | null {
  if (dropFormProblem(form)) return null;
  const keyword = form.keyword.trim();
  return { name: form.name.trim() || autoName(keyword), keyword: keyword || null, sources: form.sources, dailyLimit: clampLimit(form.limit, max) };
}

/** Puts a changed drop into the cached list: replaced in place, or first when it is new. */
export function storeDrop(list: DropListResponse | undefined, drop: Drop): DropListResponse | undefined {
  if (!list) return list;
  const known = list.drops.some((d) => d.id === drop.id);
  return { ...list, drops: known ? list.drops.map((d) => (d.id === drop.id ? drop : d)) : [drop, ...list.drops] };
}
